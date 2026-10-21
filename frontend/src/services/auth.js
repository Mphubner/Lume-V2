const AUTH_ENTRY_PATHS = new Set(['/login', '/cadastro', '/esqueci-senha', '/auth/callback']);

export const MIN_PASSWORD_LENGTH = 8;

export function safeAuthDestination(value, fallback = '/dashboard') {
  const path = typeof value === 'string' ? value : value?.pathname ? `${value.pathname}${value.search || ''}${value.hash || ''}` : '';
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\') || [...path].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) return fallback;
  try {
    const url = new URL(path, window.location.origin);
    if (url.origin !== window.location.origin || AUTH_ENTRY_PATHS.has(url.pathname)) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch { return fallback; }
}

export function authDestination(location) {
  return safeAuthDestination(location?.state?.from || new URLSearchParams(location?.search).get('next'));
}

export function authLink(path, next) {
  return `${path}?next=${encodeURIComponent(safeAuthDestination(next))}`;
}

export function authCallbackUrl(next) {
  return `${window.location.origin}${authLink('/auth/callback', next)}`;
}

export function hasConfirmedEmail(user) {
  return Boolean(user?.email && user?.email_confirmed_at);
}

export function isUnconfirmedEmailError(error) {
  return error?.code === 'email_not_confirmed' || /email not confirmed/i.test(error?.message || '');
}

export function authErrorMessage(error, action = 'login') {
  const code = error?.code || '';
  const message = error?.message || '';
  if (isUnconfirmedEmailError(error)) return 'Confirme seu email para entrar. Você pode solicitar outro link abaixo.';
  if (code === 'auth_not_configured') return 'O acesso está temporariamente indisponível. Tente novamente mais tarde.';
  if (code === 'provider_disabled' || /provider.*(disabled|not enabled)|unsupported provider/i.test(message)) return 'O acesso com Google está indisponível. Entre com email e senha ou use “Esqueci minha senha”.';
  if (code === 'invalid_credentials' || /invalid login credentials/i.test(message)) return 'Email ou senha incorretos. Se já usava este email, tente recuperar a senha.';
  if (['user_already_exists', 'email_exists'].includes(code) || /already registered/i.test(message)) return 'Se você já tem conta com este email, entre ou recupere a senha.';
  if (code === 'weak_password' || /password.*(least|weak|short)/i.test(message)) return 'Escolha uma senha mais forte, com pelo menos 8 caracteres.';
  if (error?.status === 429 || code.includes('rate_limit') || /rate limit|too many|after \d+ seconds/i.test(message)) return 'Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.';
  if (code === 'same_password') return 'Escolha uma senha diferente da anterior.';
  if (code === 'signup_disabled') return 'Novos cadastros estão temporariamente indisponíveis. Se já tem conta, faça login.';
  if (code === 'email_address_invalid' || /invalid email/i.test(message)) return 'Confira o endereço de email e tente novamente.';
  if (code === 'email_address_not_authorized') return 'Não foi possível enviar para este endereço. O serviço de email precisa ser liberado pela equipe do Lume.';
  if (['otp_expired', 'flow_state_expired', 'flow_state_not_found', 'bad_code_verifier', 'session_not_found'].includes(code)) return 'Este link é inválido ou expirou. Solicite um novo link e tente novamente.';
  if (error?.name === 'AuthRetryableFetchError' || /failed to fetch|network|fetch failed/i.test(message)) return 'Não foi possível conectar. Verifique sua conexão e tente novamente.';
  if (action === 'email') return 'Não foi possível solicitar o email. Aguarde um pouco e tente novamente.';
  if (action === 'signup') return 'Não foi possível criar a conta. Tente novamente em alguns instantes.';
  if (action === 'password') return 'Não foi possível alterar a senha. Solicite outro link de recuperação e tente novamente.';
  return 'Não foi possível entrar. Tente novamente em alguns instantes.';
}

export function authCallbackError(location = window.location) {
  const query = new URLSearchParams(location.search);
  const hash = new URLSearchParams(location.hash?.replace(/^#/, ''));
  const code = query.get('error_code') || hash.get('error_code');
  if (code || query.has('error') || hash.has('error')) return authErrorMessage({ code: code || 'otp_expired' }, 'password');
  return '';
}
