export default function DataError({ error, onRetry }) {
  return <div className="card data-error" role="alert">
    <h2>Não foi possível confirmar os dados</h2>
    <p>{error?.message || 'A conexão falhou. Os valores não foram atualizados.'}</p>
    <p>Não interprete este estado como saldo zero ou ausência de pendências.</p>
    {onRetry && <button className="btn btn-primary" onClick={onRetry}>Tentar novamente</button>}
  </div>;
}
