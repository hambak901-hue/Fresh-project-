/**
 * @file cms.ts
 * Content Management System & Dynamic Branding router for HambakTech Enterprise.
 * Provides public read endpoints and strictly authorized administrator write endpoints.
 */

import { Router } from 'express';
import { db } from '../db/database.js';
import { sendEmail } from '../services/mailer.js';
import { parseToken } from './auth.js';

export const cmsRouter = Router();

// Middleware: Require Admin or SuperAdmin
function requireAdmin(req: any, res: any, next: any) {
  const session = parseToken(req.headers.authorization);
  if (!session) {
    return res.status(401).json({ error: 'Authentication token required' });
  }

  const user = db.findUserById(session.userId);
  if (!user) {
    return res.status(401).json({ error: 'User does not exist' });
  }

  if (user.status === 'suspended') {
    return res.status(403).json({ error: 'Your account is suspended.' });
  }

  if (user.role !== 'admin' && user.role !== 'superadmin') {
    return res.status(403).json({ error: 'Access denied: Administrator privileges required' });
  }

  req.user = user;
  next();
}

// -------------------------------------------------------------------
// PUBLIC READ ENDPOINTS (Visitors & Prospective Customers)
// -------------------------------------------------------------------

// GET /api/cms/public - Live public content for visitors
cmsRouter.get('/public', handlePublicContent);
cmsRouter.get('/public-content', handlePublicContent);

function handlePublicContent(req: any, res: any) {
  const data = db.data;

  // Filter only published announcements
  const publishedAnnouncements = (data.announcements || [])
    .filter(a => a.status === 'published')
    .sort((a, b) => {
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
}

// POST /api/cms/contact - User Contact Form Submission (Public)
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

// -------------------------------------------------------------------
// ADMINISTRATOR-ONLY ENDPOINTS (Strictly Authorized)
// -------------------------------------------------------------------

// GET /api/cms/admin - Full CMS configuration (including drafts and inactive menus)
cmsRouter.get('/admin', requireAdmin, (req: any, res) => {
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

// POST & PUT /api/cms/branding - Update branding & visual identity
function handleUpdateBranding(req: any, res: any) {
  const updated = db.updateBranding(req.body);
  db.logAudit('CMS_BRANDING_UPDATED', req.body, req.user?.id, req.user?.email);
  res.json({ success: true, branding: updated });
}
cmsRouter.post('/branding', requireAdmin, handleUpdateBranding);
cmsRouter.put('/branding', requireAdmin, handleUpdateBranding);

// POST & PUT /api/cms/sections - Update section copy, headlines, and hero banner
function handleUpdateSections(req: any, res: any) {
  const updated = db.updateCmsSections(req.body);
  db.logAudit('CMS_SECTIONS_UPDATED', req.body, req.user?.id, req.user?.email);
  res.json({ success: true, cms_sections: updated });
}
cmsRouter.post('/sections', requireAdmin, handleUpdateSections);
cmsRouter.put('/sections', requireAdmin, handleUpdateSections);

// Sub-section updates
cmsRouter.put('/hero', requireAdmin, (req: any, res) => {
  const current = db.data.cms_sections || {};
  const updated = db.updateCmsSections({ ...current, hero: { ...current.hero, ...req.body } });
  db.logAudit('CMS_HERO_UPDATED', req.body, req.user?.id, req.user?.email);
  res.json({ success: true, hero: updated.hero });
});

cmsRouter.put('/company-intro', requireAdmin, (req: any, res) => {
  const current = db.data.cms_sections || {};
  const updated = db.updateCmsSections({ ...current, companyIntro: { ...current.companyIntro, ...req.body } });
  db.logAudit('CMS_COMPANY_INTRO_UPDATED', req.body, req.user?.id, req.user?.email);
  res.json({ success: true, companyIntro: updated.companyIntro });
});

cmsRouter.put('/how-it-works', requireAdmin, (req: any, res) => {
  const current = db.data.cms_sections || {};
  const updated = db.updateCmsSections({ ...current, howItWorks: Array.isArray(req.body) ? req.body : req.body.steps || current.howItWorks });
  db.logAudit('CMS_HOW_IT_WORKS_UPDATED', req.body, req.user?.id, req.user?.email);
  res.json({ success: true, howItWorks: updated.howItWorks });
});

cmsRouter.put('/benefits', requireAdmin, (req: any, res) => {
  const current = db.data.cms_sections || {};
  const updated = db.updateCmsSections({ ...current, benefits: { ...current.benefits, ...req.body } });
  db.logAudit('CMS_BENEFITS_UPDATED', req.body, req.user?.id, req.user?.email);
  res.json({ success: true, benefits: updated.benefits });
});

// POST & PUT /api/cms/visibility - Toggle public page visibility
function handleUpdateVisibility(req: any, res: any) {
  const updated = db.updatePageVisibility(req.body);
  db.logAudit('CMS_VISIBILITY_UPDATED', req.body, req.user?.id, req.user?.email);
  res.json({ success: true, pageVisibility: updated });
}
cmsRouter.post('/visibility', requireAdmin, handleUpdateVisibility);
cmsRouter.put('/visibility', requireAdmin, handleUpdateVisibility);
cmsRouter.put('/page-visibility', requireAdmin, handleUpdateVisibility);

// Announcements CRUD (Admin only)
cmsRouter.post('/announcements', requireAdmin, (req: any, res) => {
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
    author: author || req.user.full_name || 'Administrator',
  });
  db.logAudit('ANNOUNCEMENT_CREATED', { id: item.id, title }, req.user?.id, req.user?.email);
  res.status(201).json({ success: true, announcement: item });
});

cmsRouter.put('/announcements/:id', requireAdmin, (req: any, res) => {
  const updated = db.updateAnnouncement(req.params.id, req.body);
  if (!updated) {
    return res.status(404).json({ error: 'Announcement not found' });
  }
  db.logAudit('ANNOUNCEMENT_UPDATED', { id: req.params.id, updates: req.body }, req.user?.id, req.user?.email);
  res.json({ success: true, announcement: updated });
});

cmsRouter.delete('/announcements/:id', requireAdmin, (req: any, res) => {
  const deleted = db.deleteAnnouncement(req.params.id);
  db.logAudit('ANNOUNCEMENT_DELETED', { id: req.params.id }, req.user?.id, req.user?.email);
  res.json({ success: deleted });
});

// FAQs CRUD (Admin only)
cmsRouter.post('/faqs', requireAdmin, (req: any, res) => {
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
  db.logAudit('FAQ_CREATED', { id: item.id, question }, req.user?.id, req.user?.email);
  res.status(201).json({ success: true, faq: item });
});

cmsRouter.put('/faqs/:id', requireAdmin, (req: any, res) => {
  const updated = db.updateFaq(req.params.id, req.body);
  if (!updated) {
    return res.status(404).json({ error: 'FAQ not found' });
  }
  db.logAudit('FAQ_UPDATED', { id: req.params.id, updates: req.body }, req.user?.id, req.user?.email);
  res.json({ success: true, faq: updated });
});

cmsRouter.delete('/faqs/:id', requireAdmin, (req: any, res) => {
  const deleted = db.deleteFaq(req.params.id);
  db.logAudit('FAQ_DELETED', { id: req.params.id }, req.user?.id, req.user?.email);
  res.json({ success: deleted });
});

// Navigation Menu management (Admin only)
function handleUpdateNavigation(req: any, res: any) {
  const updated = db.updateNavigation(req.body.navigation || req.body || []);
  db.logAudit('NAVIGATION_UPDATED', { count: updated.length }, req.user?.id, req.user?.email);
  res.json({ success: true, navigation: updated });
}
cmsRouter.post('/navigation', requireAdmin, handleUpdateNavigation);
cmsRouter.put('/navigation', requireAdmin, handleUpdateNavigation);
