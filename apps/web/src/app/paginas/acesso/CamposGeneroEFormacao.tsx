import { generoDoCodigo, profissaoDoCodigo } from '@gestao-ambiental/domain'
import { Controller, useWatch, type Control } from 'react-hook-form'
import type { z } from 'zod'

import { CampoEmCurso, CampoFormacao, CampoGenero } from '@/components/campos-da-pessoa'

import type { esquemaGeneroEFormacao } from './esquemas'

export type DadosGeneroEFormacao = z.infer<typeof esquemaGeneroEFormacao>

/**
 * Gênero, formação e "Ainda estou cursando" num formulário do react-hook-form (criar conta, conta
 * nova pelo convite e "Complete seu cadastro"). As opções de formação seguem o gênero marcado.
 */
export function CamposGeneroEFormacao<T extends DadosGeneroEFormacao>({
  control,
}: {
  control: Control<T>
}) {
  // O formulário tem outros campos além destes; aqui só estes interessam.
  const controle = control as unknown as Control<DadosGeneroEFormacao>
  const genero = generoDoCodigo(useWatch({ control: controle, name: 'genero' }))
  return (
    <>
      <Controller
        control={controle}
        name="genero"
        render={({ field, fieldState }) => (
          <CampoGenero
            ref={field.ref}
            valor={generoDoCodigo(field.value) ?? ''}
            aoMudar={field.onChange}
            aoSair={field.onBlur}
            erro={fieldState.error?.message}
            desabilitado={field.disabled}
          />
        )}
      />
      <Controller
        control={controle}
        name="profissao"
        render={({ field, fieldState }) => (
          <CampoFormacao
            ref={field.ref}
            genero={genero}
            valor={profissaoDoCodigo(field.value) ?? ''}
            aoMudar={field.onChange}
            aoSair={field.onBlur}
            erro={fieldState.error?.message}
            desabilitado={field.disabled}
          />
        )}
      />
      <Controller
        control={controle}
        name="emCurso"
        render={({ field }) => (
          <CampoEmCurso
            ref={field.ref}
            marcado={field.value}
            aoMudar={field.onChange}
            aoSair={field.onBlur}
            desabilitado={field.disabled}
          />
        )}
      />
    </>
  )
}
