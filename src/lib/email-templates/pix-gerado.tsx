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
  pixCode?: string
}

const Email = ({ empresa, cnpj, link, pixCode }: Props) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>Sua guia de pagamento do Certificado Digital já está disponível</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={badge}>
          <Text style={badgeText}>CERTIFICADO DIGITAL MEI</Text>
        </Section>

        <Heading style={h1}>Guia de pagamento disponível</Heading>

        <Text style={text}>
          Olá{empresa ? `, ${empresa}` : ''}. Registramos a sua solicitação de emissão do
          <strong> Certificado Digital</strong>
          {cnpj ? ` para o CNPJ ${cnpj}` : ''}.
        </Text>

        <Text style={text}>
          A <strong>guia de pagamento (PIX)</strong> já está disponível. Após a confirmação
          do pagamento, o seu Certificado Digital é <strong>emitido e vinculado
          automaticamente ao seu CNPJ</strong>, sem necessidade de nenhuma outra etapa.
        </Text>

        {link ? (
          <Section style={{ margin: '0 0 24px' }}>
            <Link style={button} href={link}>
              Acessar minha guia de pagamento
            </Link>
          </Section>
        ) : null}

        {pixCode ? (
          <Section style={pixBox}>
            <Text style={pixLabel}>PIX copia e cola</Text>
            <Text style={pixValue}>{pixCode}</Text>
          </Section>
        ) : null}

        <Hr style={hr} />
        <Text style={footer}>
          Este é um comunicado automático referente à solicitação realizada em nosso portal.
          Caso o pagamento já tenha sido efetuado, desconsidere esta mensagem.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: 'Sua guia de pagamento do Certificado Digital está disponível',
  displayName: 'PIX gerado — guia disponível',
  previewData: {
    empresa: 'EMPRESA EXEMPLO MEI',
    cnpj: '12.345.678/0001-90',
    link: 'https://certificadodigitalccmei.online/c/exemplo',
    pixCode: '00020126...5802BR6009SAO PAULO62070503***6304ABCD',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, Helvetica, sans-serif' }
const container = { padding: '24px', maxWidth: '600px' }
const badge = { margin: '0 0 18px' }
const badgeText = {
  fontSize: '11px',
  letterSpacing: '1px',
  color: '#0b5d3b',
  fontWeight: 'bold' as const,
  margin: '0',
}
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#111111', margin: '0 0 18px' }
const text = { fontSize: '15px', color: '#333333', lineHeight: '1.6', margin: '0 0 16px' }
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
const pixBox = {
  backgroundColor: '#f5f7f6',
  borderRadius: '8px',
  padding: '14px 16px',
  margin: '0 0 20px',
}
const pixLabel = { fontSize: '12px', color: '#666666', margin: '0 0 6px', fontWeight: 'bold' as const }
const pixValue = { fontSize: '12px', color: '#111111', margin: '0', wordBreak: 'break-all' as const }
const hr = { borderColor: '#e5e7eb', margin: '24px 0' }
const footer = { fontSize: '12px', color: '#8a8f98', lineHeight: '1.5', margin: '0' }

export default Email
