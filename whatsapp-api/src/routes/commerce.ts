import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { sendAdvancedAndPersist } from '../services/outboundAdvanced.js';

export const commerceRouter = Router();

const toSchema = z.string().min(1).max(40);
const idSchema = z.string().trim().min(1).max(200);
const messageIdSchema = z.string().trim().min(1).max(500);

const productSchema = z.object({
  to: toSchema,
  catalogId: idSchema,
  productRetailerId: idSchema,
  body: z.string().trim().min(1).max(1024).optional(),
  footer: z.string().trim().min(1).max(60).optional(),
  replyToMessageId: messageIdSchema.optional()
});

const productListSchema = z.object({
  to: toSchema,
  catalogId: idSchema,
  header: z.string().trim().min(1).max(60),
  body: z.string().trim().min(1).max(1024),
  footer: z.string().trim().min(1).max(60).optional(),
  sections: z.array(z.object({
    title: z.string().trim().min(1).max(24),
    productItems: z.array(z.object({
      productRetailerId: idSchema
    })).min(1).max(30)
  })).min(1).max(10),
  replyToMessageId: messageIdSchema.optional()
}).superRefine((value, ctx) => {
  const products = value.sections.reduce(
    (total, section) => total + section.productItems.length,
    0
  );
  if (products > 30) {
    ctx.addIssue({
      code: 'custom',
      message: 'El mensaje puede contener como máximo 30 productos.',
      path: ['sections']
    });
  }
});

const catalogSchema = z.object({
  to: toSchema,
  body: z.string().trim().min(1).max(1024),
  footer: z.string().trim().min(1).max(60).optional(),
  thumbnailProductRetailerId: idSchema.optional(),
  replyToMessageId: messageIdSchema.optional()
});

type ProductInput = z.infer<typeof productSchema>;
type ProductListInput = z.infer<typeof productListSchema>;
type CatalogInput = z.infer<typeof catalogSchema>;

function context(replyToMessageId?: string) {
  return replyToMessageId ? { context: { message_id: replyToMessageId } } : {};
}

export function buildProductMessage(input: ProductInput): Record<string, unknown> {
  return {
    type: 'interactive',
    interactive: {
      type: 'product',
      ...(input.body ? { body: { text: input.body } } : {}),
      ...(input.footer ? { footer: { text: input.footer } } : {}),
      action: {
        catalog_id: input.catalogId,
        product_retailer_id: input.productRetailerId
      }
    },
    ...context(input.replyToMessageId)
  };
}

export function buildProductListMessage(input: ProductListInput): Record<string, unknown> {
  return {
    type: 'interactive',
    interactive: {
      type: 'product_list',
      header: { type: 'text', text: input.header },
      body: { text: input.body },
      ...(input.footer ? { footer: { text: input.footer } } : {}),
      action: {
        catalog_id: input.catalogId,
        sections: input.sections.map((section) => ({
          title: section.title,
          product_items: section.productItems.map((product) => ({
            product_retailer_id: product.productRetailerId
          }))
        }))
      }
    },
    ...context(input.replyToMessageId)
  };
}

export function buildCatalogMessage(input: CatalogInput): Record<string, unknown> {
  return {
    type: 'interactive',
    interactive: {
      type: 'catalog_message',
      body: { text: input.body },
      action: {
        name: 'catalog_message',
        parameters: {
          ...(input.thumbnailProductRetailerId
            ? { thumbnail_product_retailer_id: input.thumbnailProductRetailerId }
            : {})
        }
      },
      ...(input.footer ? { footer: { text: input.footer } } : {})
    },
    ...context(input.replyToMessageId)
  };
}

const limiter = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Demasiados mensajes de comercio. Esperá un minuto.' }
});

commerceRouter.use(limiter);

commerceRouter.post('/product', async (req, res) => {
  const input = productSchema.parse(req.body);
  const outcome = await sendAdvancedAndPersist({
    to: input.to,
    type: 'commerce_product',
    text: input.body || `Producto ${input.productRetailerId}`,
    message: buildProductMessage(input)
  });
  res.status(outcome.statusCode).json(outcome.payload);
});

commerceRouter.post('/product-list', async (req, res) => {
  const input = productListSchema.parse(req.body);
  const outcome = await sendAdvancedAndPersist({
    to: input.to,
    type: 'commerce_product_list',
    text: input.body,
    message: buildProductListMessage(input)
  });
  res.status(outcome.statusCode).json(outcome.payload);
});

commerceRouter.post('/catalog', async (req, res) => {
  const input = catalogSchema.parse(req.body);
  const outcome = await sendAdvancedAndPersist({
    to: input.to,
    type: 'commerce_catalog',
    text: input.body,
    message: buildCatalogMessage(input)
  });
  res.status(outcome.statusCode).json(outcome.payload);
});
