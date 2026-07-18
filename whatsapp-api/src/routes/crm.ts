import { Router } from 'express';
import { crmContactsRouter } from './crmContacts.js';
import { crmSettingsRouter } from './crmSettings.js';

export const crmRouter = Router();
crmRouter.use('/contacts', crmContactsRouter);
crmRouter.use('/', crmSettingsRouter);
