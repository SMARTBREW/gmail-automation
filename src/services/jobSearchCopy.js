/**
 * Job Search copy helpers — warm, direct, no ultimatums.
 * 4 touchpoints. Avoid em/en dashes in copy.
 *
 * Two company tracks:
 *   - product  (default): startups / product companies
 *   - services: IT services, consulting, staffing, delivery firms
 *
 * Set on contact as "companyType": "services" | "product"
 */

const CAREER_LOCAL_PARTS = new Set([
  'careers',
  'career',
  'hr',
  'recruitment',
  'recruiting',
  'hiring',
  'jobs',
  'talent',
  'people',
  'peopleops',
  'peopleoperations',
  'peopleteam',
  'humanresources',
  'hrteam',
  'talentacquisition',
  'campus',
  'campushiring',
  'university',
  'join',
  'apply',
  'applications',
  'hrd',
  'hroperations',
  'recruiter',
]);

export function isCareerMailbox(email) {
  const local = (String(email || '').split('@')[0] || '').toLowerCase().replace(/[._-]/g, '');
  if (CAREER_LOCAL_PARTS.has(local)) return true;
  return (
    local.includes('recruit') ||
    local.includes('career') ||
    local.startsWith('hr') ||
    local.includes('hiring') ||
    local.includes('talent') ||
    local.includes('peopleops')
  );
}

export function getJobSearchGreeting(recipientName) {
  const name = String(recipientName || '').trim();
  return name ? `Hi ${name},` : 'Hi,';
}

function companyLabel(company) {
  return company?.trim() || 'your organization';
}

/** Normalize contact/campaign companyType to product | services. */
export function normalizeCompanyType(value) {
  const v = String(value || '')
    .trim()
    .toLowerCase();
  if (
    v === 'services' ||
    v === 'service' ||
    v === 'it-services' ||
    v === 'consulting' ||
    v === 'staffing' ||
    v === 'delivery'
  ) {
    return 'services';
  }
  return 'product';
}

const PRODUCT_COPY = {
  tldr: {
    career: () =>
      `I don't have many hobbies outside building software. When I find a company whose product I respect, I want to contribute: heads down, shipping, helping take something from 0 to 1 or 1 to 100. That's what I'm optimizing for right now.`,
    named: () =>
      `I don't have many hobbies outside building software. When I find a company whose product I respect, I want to contribute: heads down, shipping, helping take something from 0 to 1 or 1 to 100. That's what I'm optimizing for right now.`,
  },
  openingLine: {
    career: (company) =>
      `Really respected what <strong>${company}</strong> is building and wanted to reach out to see if there are openings for engineers, or if you could point me to the right person on the hiring / engineering side.`,
    named: (company) =>
      `Really respected what <strong>${company}</strong> is building and wanted to reach out to see if there were any openings for engineers on the team (or if you know who I should talk to).`,
  },
  askLine: {
    career: (company) =>
      `I'd love to be part of a team at <strong>${company}</strong> that's building hard things. Looking forward to hearing from you whenever you have a moment.`,
    named: (company) =>
      `I'd love to be part of a team at <strong>${company}</strong> that's building hard things. Looking forward to hearing from you whenever you have a moment.`,
  },
  followUpIntro: {
    career: () => `Just floating my earlier note back up in case it got buried.`,
    named: () => `Just floating my earlier note back up in case it got buried.`,
  },
  followUpAsk: {
    career: (company) =>
      `I'm still very interested in <strong>${company}</strong>. If there are relevant openings, or someone on recruiting / engineering I should connect with, I'd really appreciate it.`,
    named: (company) =>
      `I'm still very interested in <strong>${company}</strong>. If there's an opening, a referral, or even just the right name to reach out to, I'd really appreciate it.`,
  },
  circleBackAsk: {
    career: (company) =>
      `I'm looking for a lean team where I can own backend and AI infra end-to-end, and <strong>${company}</strong> is still high on that list. If there are open roles, or a better contact on your side, I'd be grateful.`,
    named: (company) =>
      `I'm looking for a lean team where I can own backend and AI infra end-to-end, and <strong>${company}</strong> is still high on that list. If you know of anything opening up, or who owns hiring, I'd be grateful.`,
  },
  finalAsk: {
    career: (company) =>
      `I'll leave this as my last note for now. I'm still interested in <strong>${company}</strong>. If there's a fit among your openings, or someone on hiring I should contact, I'd appreciate the nudge. If not, totally fine.`,
    named: (company) =>
      `I'll leave this as my last note for now. I'm still interested in <strong>${company}</strong>. If there's a fit, an opening, or someone I should talk to, I'd appreciate the nudge. If not, totally fine.`,
  },
};

/** Services / consulting / staffing track — delivery-focused, not product-vision. */
const SERVICES_COPY = {
  tldr: {
    career: () =>
      `I don't have many hobbies outside building software. I'm looking for a delivery-focused engineering role where I can ship reliable backend and AI systems for real client work, and stay accountable until it holds in production.`,
    named: () =>
      `I don't have many hobbies outside building software. I'm looking for a delivery-focused engineering role where I can ship reliable backend and AI systems for real client work, and stay accountable until it holds in production.`,
  },
  openingLine: {
    career: (company) =>
      `I came across <strong>${company}</strong> and wanted to reach out about engineering openings on your delivery / product-engineering teams, or if you could point me to the right person in hiring.`,
    named: (company) =>
      `I came across <strong>${company}</strong> and wanted to reach out about engineering openings on your side (or if you know who owns hiring for backend / full-stack roles).`,
  },
  askLine: {
    career: (company) =>
      `I'd love to contribute at <strong>${company}</strong> on client or product delivery where reliability and ownership matter. Looking forward to hearing from you whenever you have a moment.`,
    named: (company) =>
      `I'd love to contribute at <strong>${company}</strong> on client or product delivery where reliability and ownership matter. Looking forward to hearing from you whenever you have a moment.`,
  },
  followUpIntro: {
    career: () => `Just floating my earlier note back up in case it got buried.`,
    named: () => `Just floating my earlier note back up in case it got buried.`,
  },
  followUpAsk: {
    career: (company) =>
      `I'm still very interested in <strong>${company}</strong>. If you have openings for backend / full-stack engineers, or someone on recruiting I should connect with, I'd really appreciate it.`,
    named: (company) =>
      `I'm still very interested in <strong>${company}</strong>. If there's an opening, a referral, or even just the right name to reach out to, I'd really appreciate it.`,
  },
  circleBackAsk: {
    career: (company) =>
      `I'm looking for a team where I can own backend and AI infra on delivery projects, and <strong>${company}</strong> is still high on that list. If there are open roles, or a better contact on your side, I'd be grateful.`,
    named: (company) =>
      `I'm looking for a team where I can own backend and AI infra on delivery projects, and <strong>${company}</strong> is still high on that list. If you know of anything opening up, or who owns hiring, I'd be grateful.`,
  },
  finalAsk: {
    career: (company) =>
      `I'll leave this as my last note for now. I'm still interested in <strong>${company}</strong>. If there's a fit among your openings, or someone on hiring I should contact, I'd appreciate the nudge. If not, totally fine.`,
    named: (company) =>
      `I'll leave this as my last note for now. I'm still interested in <strong>${company}</strong>. If there's a fit, an opening, or someone I should talk to, I'd appreciate the nudge. If not, totally fine.`,
  },
};

const SUBJECTS = {
  1: {
    career: 'Engineering at {company}',
    named: 'Engineering at {company}',
  },
  2: {
    career: 'Following up: Engineering at {company}',
    named: 'Following up: Engineering at {company}',
  },
  3: {
    career: 'Quick follow-up on {company}',
    named: 'Quick follow-up on {company}',
  },
  4: {
    career: 'Last note for now: {senderName} | {company}',
    named: 'Last note for now: {senderName} | {company}',
  },
};

function copySet(companyType) {
  return normalizeCompanyType(companyType) === 'services' ? SERVICES_COPY : PRODUCT_COPY;
}

function pickCopy(key, isCareer, company, companyType) {
  const variant = isCareer ? 'career' : 'named';
  return copySet(companyType)[key][variant](companyLabel(company));
}

function pickSubject(touchpoint, isCareer) {
  const tp = SUBJECTS[touchpoint] || SUBJECTS[1];
  return isCareer ? tp.career : tp.named;
}

export function applyJobSearchPlaceholders(
  text,
  { recipientName, company, senderName, to, touchpoint = 1, companyType = 'product' },
) {
  if (!text) return text;

  const isCareer = isCareerMailbox(to);
  const greeting = getJobSearchGreeting(recipientName);
  const companyName = companyLabel(company);
  const sender = senderName || '';
  const type = normalizeCompanyType(companyType);

  let out = text
    .replace(/{greeting}/gi, greeting)
    .replace(/{tldr}/gi, pickCopy('tldr', isCareer, company, type))
    .replace(/{openingLine}/gi, pickCopy('openingLine', isCareer, company, type))
    .replace(/{askLine}/gi, pickCopy('askLine', isCareer, company, type))
    .replace(/{followUpIntro}/gi, pickCopy('followUpIntro', isCareer, company, type))
    .replace(/{followUpAsk}/gi, pickCopy('followUpAsk', isCareer, company, type))
    .replace(/{circleBackAsk}/gi, pickCopy('circleBackAsk', isCareer, company, type))
    .replace(/{finalAsk}/gi, pickCopy('finalAsk', isCareer, company, type))
    .replace(/{senderName}/gi, sender)
    .replace(/{company}/gi, companyName);

  if (recipientName?.trim()) {
    out = out.replace(/{recipientName}/gi, recipientName.trim());
  } else {
    out = out.replace(/Dear\s+{recipientName},/gi, 'Hi,');
    out = out.replace(/Hi\s+{recipientName},/gi, 'Hi,');
    out = out.replace(/{recipientName}/gi, '');
  }

  return out;
}

export function applyJobSearchSubject(subject, { company, senderName, to, touchpoint = 1, companyType = 'product' }) {
  const isCareer = isCareerMailbox(to);
  const base = pickSubject(touchpoint, isCareer);
  return applyJobSearchPlaceholders(base, {
    recipientName: '',
    company,
    senderName,
    to,
    touchpoint,
    companyType,
  });
}
