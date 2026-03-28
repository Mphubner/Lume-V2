import { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Sun, ArrowRight, Upload, BrainCircuit, LineChart, Target, CheckCircle2, ChevronDown, Lock, Shield, Cpu, Zap, HeartHandshake } from 'lucide-react';
import './LandingPage.css';

export default function LandingPage() {
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  const [activeFaq, setActiveFaq] = useState(null);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const faqs = [
    { q: 'Por que o Lume é diferente?', a: 'O Lume é a primeira ferramenta construída nativamente para entender o brasileiro médio. Ela une o poder bancário de grandes empresas com a facilidade que sua família precisa para crescer sem planilhas complexas.' },
    { q: 'A Inteligência Artificial preenche tudo sozinha?', a: 'Com 95% de precisão! Basta subir seus extratos (PDF, OFX, CSV) e o Lume reconhece padarias, ubers, salários e contas de consumo para categorizar seus gastos no piloto automático.' },
    { q: 'Meus dados estão seguros?', a: 'Completamente. Utilizamos infraestrutura Supabase isolada por usuário (Row Level Security) e criptografia de ponta. Nós não vendemos seus dados para publicidade.' },
    { q: 'Como funciona a divisão em Família?', a: 'No Plano Família, o titular pode convidar até 5 membros. Vocês poderão decidir quais contas bancárias são compartilhadas para as métricas da casa, enquanto protegem saldos estritamente pessoais de serem visualizados por outros.' },
    { q: 'Posso cancelar quando quiser?', a: 'Sim! Nosso plano utiliza o Stripe Checkout, oferecendo cancelamento com 1 clique nas configurações do seu plano a qualquer momento.' },
  ];

  return (
    <div className="landing-container">
      {/* HEADER NAVBAR */}
      <header className={`landing-header ${scrolled ? 'scrolled' : ''}`}>
        <div className="landing-header-inner">
          <div className="landing-logo">
            <div className="logo-icon"><Sun size={20} color="#0f1219" /></div>
            <span>Lume</span>
          </div>
          
          <nav className="landing-nav desktop-only">
            <a href="#funcionalidades">Funcionalidades</a>
            <a href="#como-funciona">Como Funciona</a>
            <a href="#planos">Planos</a>
            <a href="#quem-somos">Quem Somos</a>
            <a href="#faq">Dúvidas</a>
          </nav>
          
          <div className="landing-actions">
            <button className="btn btn-secondary btn-sm" onClick={() => navigate('/login')}>Entrar</button>
            <button className="btn btn-primary btn-sm" onClick={() => navigate('/cadastro')}>Assinar Agora</button>
          </div>
        </div>
      </header>

      {/* HERO SECTION */}
      <section className="hero-section">
        <div className="hero-content">
          <div className="hero-badge">
            ✨ Simples para começar, poderoso para crescer
          </div>
          <h1 className="hero-title">
            Suas finanças organizadas<br/>
            <span className="text-gold">em minutos, não em horas.</span>
          </h1>
          <p className="hero-subtitle">
            Do primeiro extrato ao planejamento avançado. Lume se adapta ao seu nível — seja você iniciante ou expert em finanças.
            <br/><span style={{ color: 'var(--color-success)', fontSize: '0.85rem', fontWeight: 600, marginTop: '10px', display: 'inline-block' }}>✨ 14 dias grátis para testar todas as funcionalidades</span>
          </p>
          
          <div className="hero-cta-group">
            <button className="btn btn-primary btn-lg" onClick={() => navigate('/cadastro')}>
              Começar Grátis <ArrowRight size={18} style={{ marginLeft: '8px' }}/>
            </button>
            <button className="btn btn-secondary btn-lg" onClick={() => navigate('/login')}>
              Já tenho conta
            </button>
          </div>

          <div className="hero-stats">
            <div className="stat-card">
              <div className="stat-value text-gold">3min</div>
              <div className="stat-label">Para importar extratos</div>
            </div>
            <div className="stat-card">
              <div className="stat-value text-gold">95%</div>
              <div className="stat-label">Precisão da IA</div>
            </div>
            <div className="stat-card">
              <div className="stat-value text-gold">12h/mês</div>
              <div className="stat-label">Economia de tempo</div>
            </div>
            <div className="stat-card">
              <div className="stat-value text-gold">100%</div>
              <div className="stat-label">Seguro e privado</div>
            </div>
          </div>
        </div>
      </section>

      {/* DUAL PATH SECTION */}
      <section id="funcionalidades" className="features-section padding-y">
        <div className="section-header center">
          <h2>Feito para você, não importa seu nível</h2>
          <p>Do iniciante ao expert, Lume evolui com você</p>
        </div>

        <div className="dual-path-container">
          <div className="path-card path-green">
            <div className="path-header">
              <div className="path-icon-wrapper"><CheckCircle2 size={24} color="var(--color-success)"/></div>
              <div>
                <h3>Começando agora?</h3>
                <p>A gente te guia</p>
              </div>
            </div>
            <p className="path-desc">Nunca organizou suas finanças? Sem problema. Lume simplifica tudo para você começar sem complicação.</p>
            
            <ul className="path-features">
              <li>
                <Upload size={18} className="icon-green"/>
                <div>
                  <strong>Importação Simplificada</strong>
                  <p>Basta fazer upload do seu extrato bancário. A IA faz todo o resto automaticamente.</p>
                </div>
              </li>
              <li>
                <BrainCircuit size={18} className="icon-green"/>
                <div>
                  <strong>Categorização Automática</strong>
                  <p>Não precisa classificar nada manualmente. Nossa IA identifica e organiza suas despesas.</p>
                </div>
              </li>
              <li>
                <Target size={18} className="icon-green"/>
                <div>
                  <strong>Metas Guiadas</strong>
                  <p>Defina quanto quer economizar e receba um plano personalizado para alcançar seu objetivo.</p>
                </div>
              </li>
              <li>
                <Shield size={18} className="icon-green"/>
                <div>
                  <strong>Reserva de Emergência</strong>
                  <p>Aprenda a construir sua segurança financeira com orientações passo a passo.</p>
                </div>
              </li>
            </ul>
          </div>

          <div className="path-card path-gold">
            <div className="path-header">
              <div className="path-icon-wrapper"><Cpu size={24} color="var(--accent-gold)"/></div>
              <div>
                <h3>Já é experiente?</h3>
                <p>Maximize seu controle</p>
              </div>
            </div>
            <p className="path-desc">Controla suas finanças há anos? Lume oferece ferramentas avançadas que você vai adorar.</p>
            
            <ul className="path-features">
              <li>
                <LineChart size={18} className="icon-gold"/>
                <div>
                  <strong>Analytics Avançado</strong>
                  <p>Análises profundas de padrões de gastos, tendências e comparativos mensais detalhados.</p>
                </div>
              </li>
              <li>
                <Lock size={18} className="icon-gold"/>
                <div>
                  <strong>Multi-Contas e Investimentos</strong>
                  <p>Gerencie contas pessoais e empresariais, acompanhe investimentos e patrimônio total.</p>
                </div>
              </li>
              <li>
                <HeartHandshake size={18} className="icon-gold"/>
                <div>
                  <strong>Gestão Familiar Completa</strong>
                  <p>Distribua despesas entre membros, defina responsáveis e controle orçamento compartilhado.</p>
                </div>
              </li>
              <li>
                <Zap size={18} className="icon-gold"/>
                <div>
                  <strong>Previsão de Fluxo de Caixa</strong>
                  <p>Projeções inteligentes baseadas no seu histórico para planejar os próximos meses.</p>
                </div>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="como-funciona" className="how-it-works-section padding-y bg-stripe">
        <div className="section-header center">
          <h2>Como funciona</h2>
          <p>Em 4 passos simples, você terá controle total das suas finanças</p>
        </div>

        <div className="steps-container">
          <div className="step-card">
            <div className="step-number text-gold">1</div>
            <div className="step-icon"><Upload size={20}/></div>
            <h3>Importe seus extratos</h3>
            <p>Faça upload do PDF ou CSV do seu banco. Suportamos todos os principais bancos brasileiros.</p>
          </div>
          <ArrowRight className="step-arrow desktop-only" size={24} color="var(--text-muted)" />
          
          <div className="step-card">
            <div className="step-number text-gold">2</div>
            <div className="step-icon"><BrainCircuit size={20}/></div>
            <h3>A IA organiza tudo</h3>
            <p>Automaticamente categorizamos, identificamos transferências e destacamos o que precisa de atenção.</p>
          </div>
          <ArrowRight className="step-arrow desktop-only" size={24} color="var(--text-muted)" />

          <div className="step-card">
            <div className="step-number text-gold">3</div>
            <div className="step-icon"><Zap size={20}/></div>
            <h3>Receba insights</h3>
            <p>Veja onde seu dinheiro está indo, receba alertas e sugestões personalizadas para economizar.</p>
          </div>
          <ArrowRight className="step-arrow desktop-only" size={24} color="var(--text-muted)" />

          <div className="step-card">
            <div className="step-number text-gold">4</div>
            <div className="step-icon"><Target size={20}/></div>
            <h3>Alcance suas metas</h3>
            <p>Acompanhe seu progresso, ajuste seu planejamento e construa o futuro que você merece.</p>
          </div>
        </div>
      </section>

      {/* PREVIEW SHOWCASE */}
      <section className="preview-section padding-y">
        <div className="section-header center">
          <h2>Veja o Lume em ação</h2>
          <p>Uma plataforma completa e intuitiva para gerenciar suas finanças</p>
        </div>

        <div className="preview-layout">
          <div className="preview-main">
            <div className="preview-text">
              <h3>Dashboard Inteligente</h3>
              <p>Visão completa das suas finanças em um único lugar</p>
              <ul>
                <li><CheckCircle2 color="var(--color-success)" size={16}/> Saldo consolidado</li>
                <li><CheckCircle2 color="var(--color-success)" size={16}/> Gráficos interativos</li>
                <li><CheckCircle2 color="var(--color-success)" size={16}/> Alertas proativos</li>
              </ul>
            </div>
            <div className="preview-image-large">
              <img src="/assets/lume-dashboard.webp" alt="Lume Dashboard Preview" />
            </div>
          </div>
          
          <div className="preview-split">
            <div className="preview-card">
               <div className="preview-text-block">
                 <h3>Categorização Automática</h3>
                 <p>A IA categoriza suas transações com 95% de precisão.</p>
               </div>
               <img src="/assets/lume-dashboard.webp" alt="Listagem Inteligente" style={{ height: '200px', objectFit: 'cover' }} />
            </div>
            <div className="preview-card">
               <div className="preview-text-block">
                 <h3>Metas e Planejamento</h3>
                 <p>Defina objetivos e acompanhe seu progresso sem esforço.</p>
               </div>
               <img src="/assets/lume-goals.png" alt="Listagem Metas" style={{ height: '200px', objectFit: 'cover', objectPosition: 'top' }} />
            </div>
          </div>
        </div>
      </section>

      {/* PRICING SECTION */}
      <section id="planos" className="pricing-section padding-y">
        <div className="section-header center">
          <h2>Planos que cabem no seu bolso</h2>
          <p>Cancele quando quiser. Mude de ideia sem estresse.</p>
        </div>
        
        <div className="pricing-container">
          <div className="price-card basic">
            <div className="price-header">
              <h3>Individual</h3>
              <p>Para você organizar suas finanças pessoais</p>
              <div className="price">
                <span className="currency">R$</span>
                <span className="amount text-gold">39,90</span>
                <span className="period">/mês</span>
              </div>
            </div>
            <ul className="price-features">
              <li><CheckCircle2 color="var(--color-success)" size={16}/> 1 usuário</li>
              <li><CheckCircle2 color="var(--color-success)" size={16}/> Importação ilimitada</li>
              <li><CheckCircle2 color="var(--color-success)" size={16}/> IA para categorização</li>
              <li><CheckCircle2 color="var(--color-success)" size={16}/> Metas e reserva de emergência</li>
              <li><CheckCircle2 color="var(--color-success)" size={16}/> Relatórios completos</li>
            </ul>
            <button className="btn btn-secondary btn-full" onClick={() => navigate('/cadastro')}>Começar Grátis</button>
          </div>

          <div className="price-card popular">
            <div className="popular-badge">MAIS POPULAR</div>
            <div className="price-header">
              <h3>Família</h3>
              <p>Para gerenciar as finanças de toda a família (Compartilhe despesas!)</p>
              <div className="price">
                <span className="currency">R$</span>
                <span className="amount text-gold">69,90</span>
                <span className="period">/mês</span>
              </div>
            </div>
            <ul className="price-features">
              <li><CheckCircle2 color="var(--color-success)" size={16}/> Até 5 usuários (+ Segurança Compartilhada)</li>
              <li><CheckCircle2 color="var(--color-success)" size={16}/> Tudo do plano Individual</li>
              <li><CheckCircle2 color="var(--color-success)" size={16}/> Gestão familiar completa</li>
              <li><CheckCircle2 color="var(--color-success)" size={16}/> Divisão de despesas inteligente</li>
              <li><CheckCircle2 color="var(--color-success)" size={16}/> Relatórios segmentados por membro</li>
            </ul>
            <button className="btn btn-primary btn-full" onClick={() => navigate('/cadastro')}>Começar Grátis</button>
          </div>
        </div>
      </section>

      {/* ABOUT US */}
      <section id="quem-somos" className="about-section padding-y bg-stripe">
        <div className="about-container">
          <div className="about-image">
            <div className="founder-avatar"><Sun size={48} color="#0f1219" /></div>
          </div>
          <div className="about-content">
            <span className="text-gold" style={{ fontSize: '0.85rem', fontWeight: 600, letterSpacing: '1px', textTransform: 'uppercase' }}>Por Que Existimos?</span>
            <h2 style={{ marginTop: '0.5rem', marginBottom: '1.5rem', fontSize: '2rem' }}>Criado por quem entende,<br/>feito para quem precisa.</h2>
            
            <p style={{ lineHeight: 1.6, color: 'var(--text-secondary)', marginBottom: '1rem' }}>
              "O Lume nasceu de uma dor crônica que o mercado insistia em não curar. 
              Ao longo de 10 anos operando como Gestor em gigantes corporativas e como Product Manager em grandes Fintechs, 
              eu observei que bancos tradicionais complicam intencionalmente a gestão da pessoa física e do médio empresário."
            </p>
            <p style={{ lineHeight: 1.6, color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
              "Você se divide gerenciando a planilha pessoal, o cartão empresarial e ainda tentando conciliar tudo em casa com o familiar no fim do mês.
              Eu criei o <strong>Lume</strong> ser a primeira plataforma unificada. Sem planilhas chatas, sem mil lançamentos manuais. 
              Minha missão é devolver o privilégio mais escasso hoje em dia: clareza e paz mental de que as suas finanças estão seguras."
            </p>
            
            <div className="founder-signature">
              <strong>Marcos Pereira</strong>
              <span>Fundador & Gestor de Produto, Lume</span>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="faq-section padding-y">
        <div className="section-header center">
          <h2>Dúvidas Frequentes</h2>
          <p>Ainda não está convencido? As respostas estão aqui.</p>
        </div>
        
        <div className="faq-container">
          {faqs.map((faq, idx) => (
            <div key={idx} className={`faq-item ${activeFaq === idx ? 'active' : ''}`}>
              <button className="faq-question" onClick={() => setActiveFaq(activeFaq === idx ? null : idx)}>
                {faq.q}
                <ChevronDown size={18} className="faq-icon" />
              </button>
              {activeFaq === idx && (
                <div className="faq-answer">
                  {faq.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* FOOTER */}
      <footer className="landing-footer">
        <div className="footer-inner">
          <div className="footer-brand">
            <div className="landing-logo" style={{ marginBottom: '1rem' }}>
              <div className="logo-icon"><Sun size={20} color="#0f1219" /></div>
              <span>Lume</span>
            </div>
            <p>Sua clareza financeira guiada por inteligência, criada no Brasil.</p>
          </div>
          
          <div className="footer-links">
            <div className="link-group">
              <h4>Plataforma</h4>
              <a href="#funcionalidades">Funcionalidades</a>
              <a href="#planos">Planos & Preços</a>
              <a href="#faq">FAQ</a>
            </div>
            <div className="link-group">
              <h4>Empresa</h4>
              <a href="#quem-somos">Nossa História</a>
              <a href="mailto:mpereirah15@gmail.com">Contato e Suporte</a>
            </div>
            <div className="link-group">
              <h4>Legal</h4>
              <a href="#">Termos de Uso</a>
              <a href="#">Privacidade e Segurança</a>
            </div>
          </div>
        </div>
        <div className="footer-bottom">
          <p>© 2026 Lume Finanças. Todos os direitos garantidos a Marcos Pereira.</p>
        </div>
      </footer>
    </div>
  );
}
