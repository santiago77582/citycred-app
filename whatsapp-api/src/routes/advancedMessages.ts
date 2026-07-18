import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { sendAdvancedAndPersist } from '../services/outboundAdvanced.js';

export const advancedMessagesRouter = Router();

const toSchema = z.string().min(1).max(40);
const messageIdSchema = z.string().trim().min(1).max(500);
const optionalContextSchema = z.object({
  replyToMessageId: messageIdSchema.optional()
});

const locationSchema = z.object({
  to: toSchema,
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  name: z.string().trim().min(1).max(1000).optional(),
  address: z.string().trim().min(1).max(1000).optional(),
  replyToMessageId: messageIdSchema.optional()
});

const addressSchema = z.object({
  street: z.string().trim().max(200).optional(),
  city: z.string().trim().max(100).optional(),
  state: z.string().trim().max(100).optional(),
  zip: z.string().trim().max(30).optional(),
  country: z.string().trim().max(100).optional(),
  countryCode: z.string().trim().max(10).optional(),
  type: z.string().trim().max(30).optional()
});

const contactSchema = z.object({
  formattedName: z.string().trim().min(1).max(300),
  firstName: z.string().trim().max(100).optional(),
  middleName: z.string().trim().max(100).optional(),
  lastName: z.string().trim().max(100).optional(),
  prefix: z.string().trim().max(30).optional(),
  suffix: z.string().trim().max(30).optional(),
  birthday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  phones: z.array(z.object({
    phone: z.string().trim().min(1).max(40),
    waId: z.string().regex(/^[0-9]{8,20}$/).optional(),
    type: z.string().trim().max(30).optional()
  })).max(10).optional(),
  emails: z.array(z.object({
    email: z.string().email().max(254),
    type: z.string().trim().max(30).optional()
  })).max(10).optional(),
  urls: z.array(z.object({
    url: z.url(),
    type: z.string().trim().max(30).optional()
  })).max(10).optional(),
  addresses: z.array(addressSchema).max(10).optional(),
  organization: z.object({
    company: z.string().trim().max(200).optional(),
    department: z.string().trim().max(200).optional(),
    title: z.string().trim().max(200).optional()
  }).optional()
});

const contactsSchema = z.object({
  to: toSchema,
  contacts: z.array(contactSchema).min(1).max(10),
  replyToMessageId: messageIdSchema.optional()
});

const reactionSchema = z.object({
  to: toSchema,
  messageId: messageIdSchema,
  emoji: z.string().max(16)
});

const replyTextSchema = z.object({
  to: toSchema,
  messageId: messageIdSchema,
  body: z.string().min(1).max(4096),
  previewUrl: z.boolean().default(false)
});

const buttonsSchema = z.object({
  to: toSchema,
  header: z.string().trim().min(1).max(60).optional(),
  body: z.string().trim().min(1).max(1024),
  footer: z.string().trim().min(1).max(60).optional(),
  buttons: z.array(z.object({
    id: z.string().trim().min(1).max(256),
    title: z.string().trim().min(1).max(20)
  })).min(1).max(3),
  replyToMessageId: messageIdSchema.optional()
});

const listRowSchema = z.object({
  id: z.string().trim().min(1).max(200),
  title: z.string().trim().min(1).max(24),
  description: z.string().trim().min(1).max(72).optional()
});

const listSchema = z.object({
  to: toSchema,
  header: z.string().trim().min(1).max(60).optional(),
  body: z.string().trim().min(1).max(1024),
  footer: z.string().trim().min(1).max(60).optional(),
  button: z.string().trim().min(1).max(20),
  sections: z.array(z.object({
    title: z.string().trim().min(1).max(24).optional(),
    rows: z.array(listRowSchema).min(1).max(10)
  })).min(1).max(10),
  replyToMessageId: messageIdSchema.optional()
}).superRefine((value, ctx) => {
  const rows = value.sections.reduce((total, section) => total + section.rows.length, 0);
  if (rows > 10) {
    ctx.addIssue({
      code: 'custom',
      message: 'La lista puede contener como máximo 10 opciones en total.',
      path: ['sections']
    });
  }
});

type LocationInput = z.infer<typeof locationSchema>;
type ContactsInput = z.infer<typeof contactsSchema>;
type ReactionInput = z.infer<typeof reactionSchema>;
type ReplyTextInput = z.infer<typeof replyTextSchema>;
type ButtonsInput = z.infer<typeof buttonsSchema>;
type ListInput = z.infer<typeof listSchema>;

function context(replyToMessageId?: string) {
  return replyToMessageId ? { context: { message_id: replyToMessageId } } : {};
}

export function buildLocationMessage(input: LocationInput): Record<string, unknown> {
  return {
    type: 'location',
    location: {
      latitude: input.latitude,
      longitude: input.longitude,
      ...(input.name ? { name: input.name } : {}),
      ...(input.address ? { address: input.address } : {})
    },
    ...context(input.replyToMessageId)
  };
}

export function buildContactsMessage(input: ContactsInput): Record<string, unknown> {
  return {
    type: 'contacts',
    contacts: input.contacts.map((contact) => ({
      name: {
        formatted_name: contact.formattedName,
        ...(contact.firstName ? { first_name: contact.firstName } : {}),
        ...(contact.middleName ? { middle_name: contact.middleName } : {}),
        ...(contact.lastName ? { last_name: contact.lastName } : {}),
        ...(contact.prefix ? { prefix: contact.prefix } : {}),
        ...(contact.suffix ? { suffix: contact.suffix } : {})
      },
      ...(contact.birthday ? { birthday: contact.birthday } : {}),
      ...(contact.phones ? {
        phones: contact.phones.map((phone) => ({
          phone: phone.phone,
          ...(phone.waId ? { wa_id: phone.waId } : {}),
          ...(phone.type ? { type: phone.type } : {})
        }))
      } : {}),
      ...(contact.emails ? {
        emails: contact.emails.map((email) => ({
          email: email.email,
          ...(email.type ? { type: email.type } : {})
        }))
      } : {}),
      ...(contact.urls ? {
        urls: contact.urls.map((url) => ({
          url: url.url,
          ...(url.type ? { type: url.type } : {})
        }))
      } : {}),
      ...(contact.addresses ? {
        addresses: contact.addresses.map((address) => ({
          ...(address.street ? { street: address.street } : {}),
          ...(address.city ? { city: address.city } : {}),
          ...(address.state ? { state: address.state } : {}),
          ...(address.zip ? { zip: address.zip } : {}),
          ...(address.country ? { country: address.country } : {}),
          ...(address.countryCode ? { country_code: address.countryCode } : {}),
          ...(address.type ? { type: address.type } : {})
        }))
      } : {}),
      ...(contact.organization ? {
        org: {
          ...(contact.organization.company ? { company: contact.organization.company } : {}),
          ...(contact.organization.department
            ? { department: contact.organization.department }
            : {}),
          ...(contact.organization.title ? { title: contact.organization.title } : {})
        }
      } : {})
    })),
    ...context(input.replyToMessageId)
  };
}

export function buildReactionMessage(input: ReactionInput): Record<string, unknown> {
  return {
    type: 'reaction',
    reaction: { message_id: input.messageId, emoji: input.emoji }
  };
}

export function buildReplyTextMessage(input: ReplyTextInput): Record<string, unknown> {
  return {
    type: 'text',
    text: { body: input.body, preview_url: input.previewUrl },
    context: { message_id: input.messageId }
  };
}

export function buildButtonsMessage(input: ButtonsInput): Record<string, unknown> {
  return {
    type: 'interactive',
    interactive: {
      type: 'button',
      ...(input.header ? { header: { type: 'text', text: input.header } } : {}),
      body: { text: input.body },
      ...(input.footer ? { footer: { text: input.footer } } : {}),
      action: {
        buttons: input.buttons.map((button) => ({
          type: 'reply',
          reply: { id: button.id, title: button.title }
        }))
      }
    },
    ...context(input.replyToMessageId)
  };
}

export function buildListMessage(input: ListInput): Record<string, unknown> {
  return {
    type: 'interactive',
    interactive: {
      type: 'list',
      ...(input.header ? { header: { type: 'text', text: input.header } } : {}),
      body: { text: input.body },
      ...(input.footer ? { footer: { text: input.footer } } : {}),
      action: {
        button: input.button,
        sections: input.sections.map((section) => ({
          ...(section.title ? { title: section.title } : {}),
          rows: section.rows.map((row) => ({
            id: row.id,
            title: row.title,
            ...(row.description ? { description: row.description } : {})
          }))
        }))
      }
    },
    ...context(input.replyToMessageId)
  };
}

const limiter = rateLimit({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Demasiados mensajes avanzados. Esperá un minuto.' }
});

advancedMessagesRouter.use(limiter);

advancedMessagesRouter.post('/location', async (req, res) => {
  const input = locationSchema.parse(req.body);
  const outcome = await sendAdvancedAndPersist({
    to: input.to,
    type: 'location',
    text: input.name || input.address || `${input.latitude}, ${input.longitude}`,
    message: buildLocationMessage(input)
  });
  res.status(outcome.statusCode).json(outcome.payload);
});

advancedMessagesRouter.post('/contacts', async (req, res) => {
  const input = contactsSchema.parse(req.body);
  const outcome = await sendAdvancedAndPersist({
    to: input.to,
    type: 'contacts',
    text: input.contacts.map((contact) => contact.formattedName).join(', '),
    message: buildContactsMessage(input)
  });
  res.status(outcome.statusCode).json(outcome.payload);
});

advancedMessagesRouter.post('/reaction', async (req, res) => {
  const input = reactionSchema.parse(req.body);
  const outcome = await sendAdvancedAndPersist({
    to: input.to,
    type: 'reaction',
    text: input.emoji || '[Reacción eliminada]',
    message: buildReactionMessage(input)
  });
  res.status(outcome.statusCode).json(outcome.payload);
});

advancedMessagesRouter.post('/reply/text', async (req, res) => {
  const input = replyTextSchema.parse(req.body);
  const outcome = await sendAdvancedAndPersist({
    to: input.to,
    type: 'text',
    text: input.body,
    message: buildReplyTextMessage(input)
  });
  res.status(outcome.statusCode).json(outcome.payload);
});

advancedMessagesRouter.post('/interactive/buttons', async (req, res) => {
  const input = buttonsSchema.parse(req.body);
  const outcome = await sendAdvancedAndPersist({
    to: input.to,
    type: 'interactive_button',
    text: input.body,
    message: buildButtonsMessage(input)
  });
  res.status(outcome.statusCode).json(outcome.payload);
});

advancedMessagesRouter.post('/interactive/list', async (req, res) => {
  const input = listSchema.parse(req.body);
  const outcome = await sendAdvancedAndPersist({
    to: input.to,
    type: 'interactive_list',
    text: input.body,
    message: buildListMessage(input)
  });
  res.status(outcome.statusCode).json(outcome.payload);
});
