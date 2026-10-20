import { useEffect, useState } from 'react';

export default function ApiStatus() {
  const [failure, setFailure] = useState(null);
  useEffect(() => {
    const handle = (event) => setFailure(event.detail);
    window.addEventListener('lume:api-error', handle);
    return () => window.removeEventListener('lume:api-error', handle);
  }, []);
  if (!failure) return null;
  return <div className="card data-error" role="alert">
    <strong>Dados não confirmados: {failure.message}</strong>
    <p>Algumas informações podem estar indisponíveis. Recarregue para tentar novamente.</p>
    <button className="btn btn-secondary" onClick={() => window.location.reload()}>Recarregar dados</button>
  </div>;
}
