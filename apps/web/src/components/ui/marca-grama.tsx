import simboloClaro from '@/assets/marca/grama-symbol-light.svg'
import simboloEscuro from '@/assets/marca/grama-symbol.svg'
import palavraClara from '@/assets/marca/grama-wordmark-light.svg'
import palavraEscura from '@/assets/marca/grama-wordmark.svg'
import { cn } from '@/lib/utils'

interface Props {
  /** Abaixo de 640px mostra o G aberto no lugar da palavra completa (áreas pequenas). */
  compactaNoCelular?: boolean
  className?: string
}

/**
 * Logo oficial do Grama (arquivos em assets/marca, copiados sem alteração). A palavra completa
 * tem 120px de largura, o mínimo do manual. O tema claro usa a versão escura e o tema escuro a
 * versão clara, trocadas pelo mesmo [data-theme] do <html> que aplica os tokens. As imagens são
 * decorativas e o nome acessível "Grama" fica no contêiner, igual em qualquer tema.
 */
export function MarcaGrama({ compactaNoCelular = false, className }: Props) {
  return (
    <span role="img" aria-label="Grama" className={cn('inline-flex shrink-0', className)}>
      {compactaNoCelular ? (
        <span className="contents sm:hidden">
          <img
            src={simboloEscuro}
            alt=""
            aria-hidden="true"
            width={160}
            height={160}
            className="size-8 dark:hidden"
          />
          <img
            src={simboloClaro}
            alt=""
            aria-hidden="true"
            width={160}
            height={160}
            className="hidden size-8 dark:block"
          />
        </span>
      ) : null}
      <span className={compactaNoCelular ? 'hidden sm:contents' : 'contents'}>
        <img
          src={palavraEscura}
          alt=""
          aria-hidden="true"
          width={616}
          height={150}
          className="h-auto w-[120px] max-w-none dark:hidden"
        />
        <img
          src={palavraClara}
          alt=""
          aria-hidden="true"
          width={616}
          height={150}
          className="hidden h-auto w-[120px] max-w-none dark:block"
        />
      </span>
    </span>
  )
}
