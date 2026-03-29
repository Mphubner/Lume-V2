import { Router } from 'express';
import { supabase } from '../config/supabase.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

// =========================================
// 1. Get ALL Entities (Families + Businesses) for a user
// =========================================
router.get('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    // Get all entities where user is the owner
    const { data: ownedEntities } = await supabase
      .from('families')
      .select('id, name, type')
      .eq('owner_id', userId);

    // Get all entities where user is a member (not owner)
    const { data: memberRels } = await supabase
      .from('family_members')
      .select('family_id, role, families(id, name, type)')
      .eq('user_id', userId);

    // Build a map to avoid duplicates
    const entityMap = new Map();

    (ownedEntities || []).forEach(e => {
      entityMap.set(e.id, { ...e, type: e.type || 'family' });
    });

    (memberRels || []).forEach(rel => {
      if (rel.families && !entityMap.has(rel.families.id)) {
        entityMap.set(rel.families.id, { ...rel.families, type: rel.families.type || 'family' });
      }
    });

    const allEntities = Array.from(entityMap.values());

    // Separate into families and businesses
    const families = allEntities.filter(e => e.type === 'family');
    const businesses = allEntities.filter(e => e.type === 'business');

    // For each entity, load its members
    const entitiesWithMembers = await Promise.all(
      allEntities.map(async (entity) => {
        const { data: members } = await supabase
          .from('family_members')
          .select('user_id, role, profiles(full_name, email, avatar_url)')
          .eq('family_id', entity.id);

        return {
          ...entity,
          members: (members || []).map(m => ({
            id: m.user_id,
            role: m.role,
            name: m.profiles?.full_name,
            email: m.profiles?.email,
            avatar: m.profiles?.avatar_url,
          })),
        };
      })
    );

    const familiesWithMembers = entitiesWithMembers.filter(e => e.type === 'family');
    const businessesWithMembers = entitiesWithMembers.filter(e => e.type === 'business');

    // Backward compat: hasFamily + flat members for the first family found
    const primaryFamily = familiesWithMembers[0];

    res.json({
      // Legacy fields for backward compat
      hasFamily: !!primaryFamily,
      family_id: primaryFamily?.id || null,
      name: primaryFamily?.name || null,
      members: primaryFamily?.members || [],

      // New multi-entity fields
      families: familiesWithMembers,
      businesses: businessesWithMembers,
    });

  } catch (error) {
    console.error('Get Family error:', error);
    res.status(500).json({ error: 'Erro ao buscar dados da família/empresa' });
  }
});

// =========================================
// 2. Create a new Entity (Business/Company)
// =========================================
router.post('/entity', authMiddleware, async (req, res) => {
  try {
    const { name, type = 'business' } = req.body;
    const userId = req.user.id;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Nome da empresa é obrigatório.' });
    }

    const { data: entity, error } = await supabase
      .from('families')
      .insert({ name: name.trim(), owner_id: userId, type })
      .select('id, name, type')
      .single();

    if (error) throw error;

    // Add the owner as a member
    await supabase.from('family_members').insert({
      family_id: entity.id,
      user_id: userId,
      role: 'owner',
    });

    res.json({ success: true, entity });
  } catch (error) {
    console.error('Create entity error:', error);
    res.status(500).json({ error: error.message || 'Erro ao criar empresa' });
  }
});

// =========================================
// 3. Add/Create Member inside a specific Entity
// =========================================
router.post('/members', authMiddleware, async (req, res) => {
  try {
    const { email, password, name, role = 'member', entity_id } = req.body;
    const userId = req.user.id;

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Nome, E-mail e Senha são obrigatórios' });
    }

    // Determine which entity to add the member to
    let targetEntityId = entity_id;

    if (!targetEntityId) {
      // Legacy flow: find or create the user's default family
      let { data: family } = await supabase.from('families').select('id').eq('owner_id', userId).eq('type', 'family').single();

      if (!family) {
        const { data: newFamily, error: familyErr } = await supabase
          .from('families')
          .insert({ name: 'Minha Família', owner_id: userId, type: 'family' })
          .select('id')
          .single();

        if (familyErr) throw familyErr;
        family = newFamily;

        // Add the owner
        await supabase.from('family_members').insert({
          family_id: family.id,
          user_id: userId,
          role: 'owner',
        });
      }

      targetEntityId = family.id;
    }

    // Verify ownership of the target entity
    const { data: entityCheck } = await supabase
      .from('families')
      .select('id, owner_id')
      .eq('id', targetEntityId)
      .single();

    if (!entityCheck || entityCheck.owner_id !== userId) {
      return res.status(403).json({ error: 'Você não tem permissão para adicionar membros a esta entidade.' });
    }

    // Get the owner's profile to inherit plan info
    const { data: ownerProfile } = await supabase
      .from('profiles')
      .select('plan, plan_status')
      .eq('id', userId)
      .single();

    // Create the invited user via Supabase Admin API
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: name },
    });

    if (authError) {
      return res.status(400).json({ error: `Erro de cadastro auth: ${authError.message}` });
    }

    const newUserId = authData.user.id;

    // CRITICAL: Update the new user's profile so they bypass onboarding
    // and inherit the owner's plan
    const { error: profileError } = await supabase
      .from('profiles')
      .update({
        onboarding_completed: true,
        plan: ownerProfile?.plan || 'family',
        plan_status: 'granted',
        full_name: name,
      })
      .eq('id', newUserId);

    if (profileError) {
      console.warn('[Family] Profile update warning for new member:', profileError.message);
      // Not fatal — the profile row may not exist yet if the trigger hasn't run.
      // Try inserting instead.
      await supabase.from('profiles').upsert({
        id: newUserId,
        email,
        full_name: name,
        onboarding_completed: true,
        plan: ownerProfile?.plan || 'family',
        plan_status: 'granted',
      });
    }

    // Add to family_members
    const { error: memberError } = await supabase
      .from('family_members')
      .insert({
        family_id: targetEntityId,
        user_id: newUserId,
        role,
      });

    if (memberError) throw memberError;

    res.json({ success: true, message: 'Membro adicionado com sucesso!' });
  } catch (error) {
    console.error('Create member error:', error);
    res.status(500).json({ error: error.message || 'Erro ao adicionar membro' });
  }
});

export default router;
