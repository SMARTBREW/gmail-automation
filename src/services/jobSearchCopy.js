/**
 * Job Search copy helpers — career inboxes (careers@, hr@, etc.) vs named contacts.
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
  'humanresources',
  'hrteam',
  'hr-team',
  'join',
  'apply',
  'applications',
]);

export function isCareerMailbox(email) {
  const local = (String(email || '').split('@')[0] || '').toLowerCase().replace(/[._-]/g, '');
  if (CAREER_LOCAL_PARTS.has(local)) return true;
  return (
    local.includes('recruit') ||
    local.includes('career') ||
    local.startsWith('hr') ||
    local.includes('hiring') ||
    local.includes('talent')
  );
}

export function getJobSearchGreeting(recipientName) {
  const name = String(recipientName || '').trim();
  return name ? `Hi ${name},` : 'Hello,';
}

function companyLabel(company) {
  return company?.trim() || 'your company';
}

const COPY = {
  openingLine: {
    career: (company) =>
      `I'm reaching out to explore engineering opportunities at <strong>${company}</strong>. I'd be grateful if my profile could be considered, or if you could direct me to the right person on your recruiting team.`,
    named: (company) =>
      `<strong>${company}</strong> is one of the teams I've had my eye on for a while. I'd love to connect about whether there might be a fit on your engineering team.`,
  },
  followUpIntro: {
    career: () =>
      `Just following up on my note about engineering opportunities in case it got buried in your inbox.`,
    named: () =>
      `Just bumping my note from last week in case it got buried under everything else in your inbox.`,
  },
  followUpAsk: {
    career: (company) =>
      `I'm still interested in <strong>${company}</strong>. If there are relevant openings, or if you could point me to the right recruiter or hiring manager, that would help me a lot.`,
    named: (company) =>
      `I'm still keen on <strong>${company}</strong>. If you have 30 seconds to point me somewhere useful (a name, a role, or even a "not hiring right now"), that would help me a lot.`,
  },
  circleBackAsk: {
    career: (company) =>
      `I'm looking for a team where I can own hard backend and AI problems in production, and <strong>${company}</strong> is still near the top of my list. If there are open roles, or a better contact on your recruiting team, I'd be grateful.`,
    named: (company) =>
      `I'm looking for a team where I can own hard backend and AI problems in production, and <strong>${company}</strong> is still near the top of my list. If you know of anything opening up, or who I should reach out to instead, I'd be grateful.`,
  },
  shortAsk: {
    career: (company) =>
      `Still interested in opportunities at <strong>${company}</strong>. Open to an application review, a referral to the right recruiter, or any guidance on current openings.`,
    named: (company) =>
      `Still interested in <strong>${company}</strong>. Open to whatever makes sense: a role, a referral, or just a name of someone I should reach out to.`,
  },
  finalAsk: {
    career: (company) =>
      `I'm still interested in <strong>${company}</strong>. If there's a fit among your current openings, or someone on the hiring team I should contact, I'd appreciate the nudge. If not, totally fine. Thanks for reading this far.`,
    named: (company) =>
      `I'm still interested in <strong>${company}</strong>. If there's ever a fit, an opening, or someone on the team I should talk to, I'd appreciate the nudge. If not, totally fine. Thanks for reading this far.`,
  },
};

const SUBJECTS = {
  1: {
    career: 'Engineering opportunities at {company} – {senderName}',
    named: "Probably the least spammy email you'll read today",
  },
  2: {
    career: 'Following up: {senderName} | {company} opportunities',
    named: 'In case my last note vanished into inbox hell',
  },
  3: {
    career: 'Quick follow-up on engineering roles at {company}',
    named: "Okay I'll keep this one short ({company})",
  },
  4: {
    career: 'Application follow-up – {senderName} | {company}',
    named: 'Last few emails before I stop bothering you',
  },
  5: {
    career: 'Final note: {senderName} | opportunities at {company}',
    named: 'Final note from {senderName} re: {company}',
  },
};

function pickCopy(key, isCareer, company) {
  const variant = isCareer ? 'career' : 'named';
  return COPY[key][variant](companyLabel(company));
}

function pickSubject(touchpoint, isCareer) {
  const tp = SUBJECTS[touchpoint] || SUBJECTS[1];
  return isCareer ? tp.career : tp.named;
}

export function applyJobSearchPlaceholders(text, { recipientName, company, senderName, to, touchpoint = 1 }) {
  if (!text) return text;

  const isCareer = isCareerMailbox(to);
  const greeting = getJobSearchGreeting(recipientName);
  const companyName = companyLabel(company);
  const sender = senderName || '';

  let out = text
    .replace(/{greeting}/gi, greeting)
    .replace(/{openingLine}/gi, pickCopy('openingLine', isCareer, company))
    .replace(/{followUpIntro}/gi, pickCopy('followUpIntro', isCareer, company))
    .replace(/{followUpAsk}/gi, pickCopy('followUpAsk', isCareer, company))
    .replace(/{circleBackAsk}/gi, pickCopy('circleBackAsk', isCareer, company))
    .replace(/{shortAsk}/gi, pickCopy('shortAsk', isCareer, company))
    .replace(/{finalAsk}/gi, pickCopy('finalAsk', isCareer, company))
    .replace(/{senderName}/gi, sender)
    .replace(/{company}/gi, companyName);

  // Legacy {recipientName} support
  if (recipientName?.trim()) {
    out = out.replace(/{recipientName}/gi, recipientName.trim());
  } else {
    out = out.replace(/Dear\s+{recipientName},/gi, 'Hello,');
    out = out.replace(/Hi\s+{recipientName},/gi, 'Hello,');
    out = out.replace(/{recipientName}/gi, '');
  }

  return out;
}

export function applyJobSearchSubject(subject, { company, senderName, to, touchpoint = 1 }) {
  const isCareer = isCareerMailbox(to);
  const base = pickSubject(touchpoint, isCareer);
  return applyJobSearchPlaceholders(base, {
    recipientName: '',
    company,
    senderName,
    to,
    touchpoint,
  });
}
