import { formatarInstanteComHora } from '@/lib/datas'
import { RESULTADOS, type RegistroVistoria } from '@/lib/vistoria/registro'

export function ResumoDoRegistro({ registro, fuso }: { registro: RegistroVistoria; fuso: string }) {
  const { localizacao } = registro

  return (
    <dl className="grid gap-3 break-words text-sm sm:grid-cols-2">
      <div>
        <dt className="text-(--text-subtle)">Resultado da vistoria</dt>
        <dd className="corpo-medio">{RESULTADOS[registro.resultado]}</dd>
      </div>
      <div>
        <dt className="text-(--text-subtle)">Área visitada</dt>
        <dd>{registro.area}</dd>
      </div>
      {registro.acompanhante ? (
        <div>
          <dt className="text-(--text-subtle)">Acompanhante</dt>
          <dd>{registro.acompanhante}</dd>
        </div>
      ) : null}
      <div>
        <dt className="text-(--text-subtle)">Foto · registro no aparelho</dt>
        <dd>
          {registro.origemFoto === 'camera' ? 'Câmera' : 'Galeria'} ·{' '}
          {formatarInstanteComHora(registro.fotoEm, fuso)}
        </dd>
      </div>
      <div>
        <dt className="text-(--text-subtle)">Localização informada pelo aparelho</dt>
        <dd>
          {localizacao
            ? `${localizacao.latitude.toFixed(5)}, ${localizacao.longitude.toFixed(5)} (±${String(Math.ceil(localizacao.precisao))} m) · ${formatarInstanteComHora(localizacao.obtidaEm, fuso)}`
            : 'Sem localização'}
        </dd>
      </div>
      {registro.observacao ? (
        <div className="sm:col-span-2">
          <dt className="text-(--text-subtle)">Observações</dt>
          <dd className="whitespace-pre-wrap">{registro.observacao}</dd>
        </div>
      ) : null}
    </dl>
  )
}
