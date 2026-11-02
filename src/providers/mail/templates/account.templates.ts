import { escapeHtml, renderEmailLayout, RenderedEmail } from './layout'

export function verifyEmailTemplate(input: { name?: string; organizationName: string; link: string }): RenderedEmail {
  const greeting = input.name ? `Hola ${escapeHtml(input.name)},` : 'Hola,'
  const org = escapeHtml(input.organizationName)
  return {
    subject: 'Confirma tu correo para activar tu organización',
    html: renderEmailLayout({
      preheader: `Activa ${input.organizationName} en NoesisHub`,
      bodyHtml: `${greeting}<br><br>Creaste la organización <strong>${org}</strong>. Confirma tu correo para empezar a usarla.`,
      action: { label: 'Confirmar correo', href: input.link },
      footnoteHtml: 'El enlace vence en 48 horas. Si no creaste esta cuenta, ignora este correo.',
    }),
    text: `${input.name ? `Hola ${input.name},` : 'Hola,'}\n\nCreaste la organización ${input.organizationName}. Confirma tu correo para empezar a usarla:\n${input.link}\n\nEl enlace vence en 48 horas. Si no creaste esta cuenta, ignora este correo.`,
  }
}

export function resetPasswordTemplate(input: { name?: string; link: string }): RenderedEmail {
  const greeting = input.name ? `Hola ${escapeHtml(input.name)},` : 'Hola,'
  return {
    subject: 'Restablece tu contraseña',
    html: renderEmailLayout({
      preheader: 'Enlace para crear una nueva contraseña',
      bodyHtml: `${greeting}<br><br>Recibimos una solicitud para restablecer tu contraseña.`,
      action: { label: 'Crear nueva contraseña', href: input.link },
      footnoteHtml:
        'El enlace vence en 1 hora y solo funciona una vez. Si no lo pediste, ignora este correo: tu contraseña no cambia.',
    }),
    text: `${input.name ? `Hola ${input.name},` : 'Hola,'}\n\nRecibimos una solicitud para restablecer tu contraseña:\n${input.link}\n\nEl enlace vence en 1 hora y solo funciona una vez. Si no lo pediste, ignora este correo.`,
  }
}

export function invitationTemplate(input: {
  name?: string
  organizationName: string
  inviterName: string
  link: string
}): RenderedEmail {
  const greeting = input.name ? `Hola ${escapeHtml(input.name)},` : 'Hola,'
  const org = escapeHtml(input.organizationName)
  const inviter = escapeHtml(input.inviterName)
  return {
    subject: `${input.inviterName} te invitó a ${input.organizationName}`,
    html: renderEmailLayout({
      preheader: `Únete a ${input.organizationName} en NoesisHub`,
      bodyHtml: `${greeting}<br><br><strong>${inviter}</strong> te invitó a unirte a <strong>${org}</strong> en NoesisHub, la base de conocimiento de tu organización.`,
      action: { label: 'Aceptar invitación', href: input.link },
      footnoteHtml: 'La invitación vence en 7 días. Si no esperabas este correo, puedes ignorarlo.',
    }),
    text: `${input.name ? `Hola ${input.name},` : 'Hola,'}\n\n${input.inviterName} te invitó a unirte a ${input.organizationName} en NoesisHub:\n${input.link}\n\nLa invitación vence en 7 días.`,
  }
}
