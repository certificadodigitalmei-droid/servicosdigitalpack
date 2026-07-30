import * as React from 'react'
import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props {
  empresa?: string
  cnpj?: string
  link?: string
  validade?: string
}

const Email = ({ empresa, cnpj, link, validade }: Props) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>Parabéns! Seu Certificado Digital foi emitido e vinculado ao seu CNPJ</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={successBox}>
          <Text style={successText}>CERTIFICADO EMITIDO COM SUCESSO</Text>
        </Section>

        <Heading style={h1}>Parabéns{empresa ? `, ${empresa}` : ''}!</Heading>

        <Text style={text}>
          Confirmamos o seu pagamento. O seu <strong>Certificado Digital</strong> já foi
          <strong> emitido e vinculado automaticamente</strong>
          {cnpj ? ` ao CNPJ ${cnpj}` : ' ao seu CNPJ'}.
        </Text>

        <Section style={infoBox}>
          {cnpj ? (
            <Text style={infoLine}>
              <strong>CNPJ:</strong> {cnpj}
            </Text>
          ) : null}
          <Text style={infoLine}>
            <strong>Situação:</strong> Ativo e vinculado
          </Text>
          <Text style={infoLine}>
            <strong>Validade:</strong> {validade || '12 meses'}
          </Text>
        </Section>

        {link ? (
          <Section style={{ margin: '0 0 24px' }}>
            <Link style={button} href={link}>
              Verificar meu certificado
            </Link>
          </Section>
        ) : null}

        <Hr style={hr} />
        <Text style={footer}>
          Guarde este e-mail como comprovante. Você pode consultar a situação do seu
          certificado a qualquer momento pelo link acima.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: 'Parabéns! Seu Certificado Digital foi emitido e vinculado ao seu CNPJ',
  displayName: 'Pagamento confirmado — certificado emitido',
  previewData: {
    empresa: 'EMPRESA EXEMPLO MEI',
    cnpj: '12.345.678/0001-90',
    link: 'https://certificadodigitalccmei.online/c/exemplo',
    validade: '12 meses',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, Helvetica, sans-serif' }
const container = { padding: '24px', maxWidth: '600px' }
const successBox = {
  backgroundColor: '#e8f6ef',
  borderRadius: '8px',
  padding: '12px 16px',
  margin: '0 0 20px',
}
const successText = {
  fontSize: '13px',
  color: '#0b5d3b',
  fontWeight: 'bold' as const,
  margin: '0',
  letterSpacing: '0.5px',
}
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#111111', margin: '0 0 18px' }
const text = { fontSize: '15px', color: '#333333', lineHeight: '1.6', margin: '0 0 16px' }
const infoBox = {
  backgroundColor: '#f5f7f6',
  borderRadius: '8px',
  padding: '14px 16px',
  margin: '0 0 22px',
}
const infoLine = { fontSize: '14px', color: '#111111', margin: '0 0 6px' }
const button = {
  backgroundColor: '#0b5d3b',
  color: '#ffffff',
  fontSize: '15px',
  borderRadius: '8px',
  padding: '13px 22px',
  textDecoration: 'none',
  display: 'inline-block',
  fontWeight: 'bold' as const,
}
const hr = { borderColor: '#e5e7eb', margin: '24px 0' }
const footer = { fontSize: '12px', color: '#8a8f98', lineHeight: '1.5', margin: '0' }

export default Email
