/**
 * @file cms.ts
 * Content Management System & Dynamic Branding router for HambakTech Enterprise.
 * Provides public read endpoints and administrator write endpoints.
 */

import { Router } from 'express';
import { db } from '../db/database.js';
import { sendEmail } from '../services/mailer.js';
import { parseToken } from './auth.js';

export const cmsRouter = Router();

// GET /api/cms/public - Live public content for visitors
cmsRouter.get('/public', (req, res) => {
  const data = db.data;

  // Filter only published announcements
  const publishedAnnouncements = (data.announcements || [])
    .filter(a => a.status === 'published')
    .sort((a, b) => {
      // Pinned first, then newest
      if (a.is_pinned && !b.is_pinned) return -1;
      if (!a.is_pinned && b.is_pinned) return 1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

  const activeNav = (data.navigation || [])
    .filter(n => n.enabled)
    .sort((a, b) => a.order - b.order);

  const rates = {
    nin_fee: data.settings.nin_fee,
    bvn_fee: data.settings.bvn_fee,
    mtn_sme_1gb: data.settings.mtn_sme_1gb,
    airtel_1gb: data.settings.airtel_1gb,
    glo_1gb: data.settings.glo_1gb,
    nine_mobile_1gb: data.settings.nine_mobile_1gb,
    airtime_discount_percent: data.settings.airtime_discount_percent,
  };

  res.json({
    success: true,
    branding: data.branding,
    cms_sections: data.cms_sections,
    announcements: publishedAnnouncements,
    faqs: data.faqs || [],
    navigation: activeNav,
    rates,
    timestamp: new Date().toISOString(),
  });
});

// GET /api/cms/admin - Full CMS configuration (including drafts and inactive menus)
cmsRouter.get('/admin', (req, res) => {
  const data = db.data;
  res.json({
    success: true,
    branding: data.branding,
    cms_sections: data.cms_sections,
    announcements: data.announcements || [],
    faqs: data.faqs || [],
    navigation: data.navigation || [],
    settings: data.settings,
  });
});

// POST /api/cms/branding - Update branding & visual identity
cmsRouter.post('/branding', (req, res) => {
  const session = parseToken(req.headers.authorization);
  const updated = db.updateBranding(req.body);
  db.logAudit('CMS_BRANDING_UPDATED', req.body, session?.userId);
  res.json({ success: true, branding: updated });
});

// POST /api/cms/sections - Update section copy, headlines, and hero banner
cmsRouter.post('/sections', (req, res) => {
  const session = parseToken(req.headers.authorization);
  const updated = db.updateCmsSections(req.body);
  db.logAudit('CMS_SECTIONS_UPDATED', req.body, session?.userId);
  res.json({ success: true, cms_sections: updated });
});

// POST /api/cms/visibility - Toggle public page visibility
cmsRouter.post('/visibility', (req, res) => {
  const session = parseToken(req.headers.authorization);
  const updated = db.updatePageVisibility(req.body);
  db.logAudit('CMS_VISIBILITY_UPDATED', req.body, session?.userId);
  res.json({ success: true, pageVisibility: updated });
});

// Announcements CRUD
cmsRouter.post('/announcements', (req, res) => {
  const session = parseToken(req.headers.authorization);
  const { title, content, category, is_pinned, status, author } = req.body;
  if (!title || !content) {
    return res.status(400).json({ error: 'Title and content are required' });
  }
  const item = db.createAnnouncement({
    title,
    content,
    category: category || 'general',
    is_pinned: Boolean(is_pinned),
    status: status || 'published',
    author: author || 'Administrator',
  });
  db.logAudit('ANNOUNCEMENT_CREATED', { id: item.id, title }, session?.userId);
  res.status(201).json({ success: true, announcement: item });
});

cmsRouter.put('/announcements/:id', (req, res) => {
  const session = parseToken(req.headers.authorization);
  const updated = db.updateAnnouncement(req.params.id, req.body);
  if (!updated) {
    return res.status(404).json({ error: 'Announcement not found' });
  }
  db.logAudit('ANNOUNCEMENT_UPDATED', { id: req.params.id, updates: req.body }, session?.userId);
  res.json({ success: true, announcement: updated });
});

cmsRouter.delete('/announcements/:id', (req, res) => {
  const session = parseToken(req.headers.authorization);
  const deleted = db.deleteAnnouncement(req.params.id);
  db.logAudit('ANNOUNCEMENT_DELETED', { id: req.params.id }, session?.userId);
  res.json({ success: deleted });
});

// FAQs CRUD
cmsRouter.post('/faqs', (req, res) => {
  const session = parseToken(req.headers.authorization);
  const { question, answer, category, order } = req.body;
  if (!question || !answer) {
    return res.status(400).json({ error: 'Question and answer are required' });
  }
  const item = db.createFaq({
    question,
    answer,
    category: category || 'general',
    order: Number(order) || (db.data.faqs.length + 1),
  });
  db.logAudit('FAQ_CREATED', { id: item.id, question }, session?.userId);
  res.status(201).json({ success: true, faq: item });
});

cmsRouter.put('/faqs/:id', (req, res) => {
  const session = parseToken(req.headers.authorization);
  const updated = db.updateFaq(req.params.id, req.body);
  if (!updated) {
    return res.status(404).json({ error: 'FAQ not found' });
  }
  db.logAudit('FAQ_UPDATED', { id: req.params.id }, session?.userId);
  res.json({ success: true, faq: updated });
});

cmsRouter.delete('/faqs/:id', (req, res) => {
  const session = parseToken(req.headers.authorization);
  const deleted = db.deleteFaq(req.params.id);
  db.logAudit('FAQ_DELETED', { id: req.params.id }, session?.userId);
  res.json({ success: deleted });
});

// Navigation Menu management
cmsRouter.post('/navigation', (req, res) => {
  const session = parseToken(req.headers.authorization);
  const updated = db.updateNavigation(req.body.navigation || []);
  db.logAudit('NAVIGATION_UPDATED', { count: updated.length }, session?.userId);
  res.json({ success: true, navigation: updated });
});

// POST /api/cms/contact - User Contact Form Submission
cmsRouter.post('/contact', async (req, res) => {
  const { name, email, phone, subject, message } = req.body;

  if (!name || !email || !message) {
    return res.status(400).json({ error: 'Name, email, and message are required.' });
  }

  // Log in audit trail
  db.logAudit('CONTACT_FORM_SUBMISSION', { name, email, phone, subject, messageLength: message.length });

  // Send automated email to support
  try {
    await sendEmail(
      db.data.branding.support_email,
      `[HambakTech Contact] ${subject || 'New Inquiry from ' + name}`,
      `<div style="font-family: Arial, sans-serif; padding: 20px;">
        <h3>New Contact Message from HambakTech Portal</h3>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Phone:</strong> ${phone || 'N/A'}</p>
        <p><strong>Subject:</strong> ${subject || 'General Inquiry'}</p>
        <hr style="margin: 16px 0;" />
        <p style="white-space: pre-wrap;">${message}</p>
      </div>`
    );
  } catch (err) {
    console.warn('Could not dispatch contact email via SMTP:', err);
  }

  res.json({
    success: true,
    message: 'Thank you for contacting HambakTech Enterprise. Our support team will respond within 2 business hours.',
  });
});
