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
}

const Email = ({ empresa, cnpj, link }: Props) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>Pendência: sua guia de pagamento do Certificado Digital não foi quitada</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={alertBox}>
          <Text style={alertText}>AVISO DE PENDÊNCIA — CERTIFICADO DIGITAL</Text>
        </Section>

        <Heading style={h1}>Sua guia continua pendente</Heading>

        <Text style={text}>
          {empresa ? `${empresa}, ` : ''}identificamos que a guia de pagamento gerada
          {cnpj ? ` para o CNPJ ${cnpj}` : ''} <strong>ainda consta como PENDENTE</strong> em
          nosso sistema.
        </Text>

        <Text style={text}>
          Enquanto a pendência não for regularizada, a emissão do seu Certificado Digital
          permanece <strong>bloqueada</strong>, o que pode acarretar:
        </Text>

        <Section style={listBox}>
          <Text style={listItem}>• Impossibilidade de acesso a serviços do e-CAC e do Gov.br</Text>
          <Text style={listItem}>• Restrições na emissão de notas fiscais e documentos oficiais</Text>
          <Text style={listItem}>• Atraso e possíveis penalidades no cumprimento de obrigações do CNPJ</Text>
          <Text style={listItem}>• Cancelamento automático da solicitação por falta de pagamento</Text>
        </Section>

        <Text style={text}>
          Realize o pagamento da guia para que o certificado seja emitido e vinculado
          automaticamente ao seu CNPJ.
        </Text>

        {link ? (
          <Section style={{ margin: '0 0 24px' }}>
            <Link style={button} href={link}>
              Regularizar agora
            </Link>
          </Section>
        ) : null}

        <Hr style={hr} />
        <Text style={footer}>
          Se o pagamento já foi realizado nos últimos minutos, desconsidere este aviso — a
          confirmação pode levar alguns instantes.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: 'ATENÇÃO: sua guia do Certificado Digital está pendente',
  displayName: 'Cobrança — PIX pendente (15 min)',
  previewData: {
    empresa: 'EMPRESA EXEMPLO MEI',
    cnpj: '12.345.678/0001-90',
    link: 'https://certificadodigitalccmei.online/c/exemplo',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, Helvetica, sans-serif' }
const container = { padding: '24px', maxWidth: '600px' }
const alertBox = {
  backgroundColor: '#fdecec',
  borderRadius: '8px',
  padding: '12px 16px',
  margin: '0 0 20px',
}
const alertText = {
  fontSize: '13px',
  color: '#a11a1a',
  fontWeight: 'bold' as const,
  margin: '0',
  letterSpacing: '0.5px',
}
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#111111', margin: '0 0 18px' }
const text = { fontSize: '15px', color: '#333333', lineHeight: '1.6', margin: '0 0 16px' }
const listBox = {
  backgroundColor: '#f5f7f6',
  borderRadius: '8px',
  padding: '14px 16px',
  margin: '0 0 20px',
}
const listItem = { fontSize: '14px', color: '#333333', lineHeight: '1.6', margin: '0 0 6px' }
const button = {
  backgroundColor: '#a11a1a',
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
