import { Router } from 'express';
import { supabase } from '../config/supabase.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

// =========================================
// 1. Get Family Details & Members
// =========================================
router.get('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    // First attempt to find a family where user is the owner
    let { data: family } = await supabase
      .from('families')
      .select('id, name')
      .eq('owner_id', userId)
      .single();

    // If not owner, check if the user is a member of any family
    if (!family) {
      const { data: memberRel } = await supabase
        .from('family_members')
        .select('family_id, families(id, name)')
        .eq('user_id', userId)
        .single();
      
      if (memberRel?.families) {
        family = memberRel.families;
      }
    }

    if (!family) {
      return res.json({ hasFamily: false, members: [] });
    }

    // Get all members of this family
    const { data: members } = await supabase
      .from('family_members')
      .select('user_id, role, profiles(full_name, email, avatar_url)')
      .eq('family_id', family.id);

    // Format output
    const formattedMembers = members.map(m => ({
      id: m.user_id,
      role: m.role,
      name: m.profiles?.full_name,
      email: m.profiles?.email,
      avatar: m.profiles?.avatar_url
    }));

    res.json({
      hasFamily: true,
      family_id: family.id,
      name: family.name,
      members: formattedMembers
    });

  } catch (error) {
    console.error('Get Family error:', error);
    res.status(500).json({ error: 'Erro ao buscar dados da família/empresa' });
  }
});

// =========================================
// 2. Add/Create Member inside Family
// =========================================
router.post('/members', authMiddleware, async (req, res) => {
  try {
    const { email, password, name, role = 'member' } = req.body;
    const userId = req.user.id;

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Nome, E-mail e Senha são obrigatórios' });
    }

    // 1. Verify/Create the family entity for the current user
    let { data: family } = await supabase.from('families').select('id').eq('owner_id', userId).single();
    
    if (!family) {
      // Create family if it doesn't exist
      const { data: newFamily, error: familyErr } = await supabase
        .from('families')
        .insert({ name: 'Minha Conta Compartilhada', owner_id: userId })
        .select('id')
        .single();
        
      if (familyErr) throw familyErr;
      family = newFamily;

      // Add the owner to family_members table too
      await supabase.from('family_members').insert({
        family_id: family.id,
        user_id: userId,
        role: 'owner'
      });
    }

    // 2. Create the invited user via Supabase Admin API
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: name }
    });

    if (authError) {
      return res.status(400).json({ error: `Erro de cadastro auth: ${authError.message}` });
    }

    const newUserId = authData.user.id;

    // 3. Add to family_members
    const { error: memberError } = await supabase
      .from('family_members')
      .insert({
        family_id: family.id,
        user_id: newUserId,
        role: role
      });

    if (memberError) {
      // In case of error adding to family, consider cleaning up auth.
      throw memberError;
    }

    res.json({ success: true, message: 'Membro/Funcionário adicionado com sucesso!' });
  } catch (error) {
    console.error('Create member error:', error);
    res.status(500).json({ error: error.message || 'Erro ao adicionar membro' });
  }
});

export default router;
