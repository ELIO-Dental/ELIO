import { scopedDb } from "@elio/db";
import type { PlanDocumentType } from "@elio/db";

export type PlanDocumentInput = {
  type: PlanDocumentType;
  title: string;
  content: string;
  version: string;
  effectiveDate: string | Date;
  isActive?: boolean;
};

export async function listDocuments(practiceId: string) {
  const db = scopedDb(practiceId);
  return db.planDocument.findMany({
    include: {
      _count: { select: { acceptances: true, signingRequests: true } },
      signingRequests: { select: { signedAt: true } },
    },
    orderBy: [{ type: "asc" }, { effectiveDate: "desc" }],
  });
}

export async function getDocument(practiceId: string, documentId: string) {
  const db = scopedDb(practiceId);
  return db.planDocument.findFirst({
    where: { id: documentId },
    include: {
      _count: { select: { acceptances: true, signingRequests: true } },
    },
  });
}

async function deactivateOtherActive(db: ReturnType<typeof scopedDb>, type: PlanDocumentType, exceptId?: string) {
  await db.planDocument.updateMany({
    where: { type, isActive: true, ...(exceptId ? { id: { not: exceptId } } : {}) },
    data: { isActive: false },
  });
}

export async function createDocument(practiceId: string, input: PlanDocumentInput) {
  const db = scopedDb(practiceId);
  const isActive = input.isActive !== false;
  if (isActive) await deactivateOtherActive(db, input.type);

  return db.planDocument.create({
    data: {
      practiceId,
      type: input.type,
      title: input.title.trim(),
      content: input.content,
      version: input.version.trim(),
      effectiveDate: new Date(input.effectiveDate),
      isActive,
    },
  });
}

export async function updateDocument(practiceId: string, documentId: string, input: Partial<PlanDocumentInput>) {
  const db = scopedDb(practiceId);
  const existing = await db.planDocument.findFirst({ where: { id: documentId } });
  if (!existing) throw new Error("Document not found");

  const isActive = input.isActive ?? existing.isActive;
  const type = input.type ?? existing.type;
  if (isActive) await deactivateOtherActive(db, type, documentId);

  return db.planDocument.update({
    where: { id: documentId },
    data: {
      ...(input.type ? { type: input.type } : {}),
      ...(input.title ? { title: input.title.trim() } : {}),
      ...(input.content !== undefined ? { content: input.content } : {}),
      ...(input.version ? { version: input.version.trim() } : {}),
      ...(input.effectiveDate ? { effectiveDate: new Date(input.effectiveDate) } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
  });
}

function defaultTermsHtml(practiceName: string): string {
  const name = practiceName || "your dental practice";
  return `
<h2>1. Introduction</h2>
<p>These Terms and Conditions ("Agreement") govern your membership of the dental care plan ("Plan") provided by ${name} ("the Practice", "we", "us", "our"). By signing up to a Plan, you agree to be bound by these Terms and Conditions.</p>
<p>Please read this Agreement carefully before completing your enrolment. If you have any questions, please contact the Practice before signing.</p>

<h2>2. Definitions</h2>
<ul>
  <li><strong>"Member"</strong> means the patient enrolled on the Plan.</li>
  <li><strong>"Plan"</strong> means the dental membership plan selected during enrolment.</li>
  <li><strong>"Monthly Fee"</strong> means the recurring amount payable by Direct Debit each month.</li>
  <li><strong>"Minimum Term"</strong> means the minimum period of 12 consecutive months from the start date of the Plan.</li>
  <li><strong>"Included Benefits"</strong> means the dental treatments and services included within the Plan as described at the time of enrolment.</li>
</ul>

<h2>3. Plan Membership</h2>
<p>3.1. Membership of the Plan is personal to the named Member and is non-transferable.</p>
<p>3.2. By enrolling, you confirm that the information you have provided is accurate and complete.</p>
<p>3.3. Membership commences on the date your first Direct Debit payment is collected successfully or, for free plans, on the date of enrolment.</p>

<h2>4. Included Benefits</h2>
<p>4.1. The specific benefits included in your Plan are as described on your plan details page at the time of enrolment.</p>
<p>4.2. Benefits are for the Minimum Term period and each subsequent 12-month period. Unused benefits do not carry over to the next period.</p>
<p>4.3. Benefits are only available at the Practice and cannot be used at any other dental practice.</p>

<h2>5. Payment Terms</h2>
<p>5.1. The Monthly Fee is collected by Direct Debit on the <strong>1st of each month</strong>. If collection on the 1st fails, a retry will be attempted on the <strong>11th of the same month</strong>.</p>
<p>5.2. You are responsible for ensuring sufficient funds are available in your bank account for each collection.</p>
<p>5.3. The Direct Debit is managed through GoCardless and is protected by the Direct Debit Guarantee.</p>
<p>5.4. We reserve the right to adjust the Monthly Fee with at least 30 days' written notice.</p>

<h2>6. Minimum Term & Cancellation</h2>
<p>6.1. The Plan has a <strong>Minimum Term of 12 months</strong>.</p>
<p>6.2. You may cancel your Plan after the Minimum Term by giving at least 30 days' written notice to the Practice.</p>

<h2>7. Data Protection</h2>
<p>We collect and process your personal data in accordance with UK GDPR and the Data Protection Act 2018.</p>

<h2>8. Governing Law</h2>
<p>This Agreement is governed by the laws of England and Wales.</p>

<p style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 13px;">
  <em>Generated for ${name} | Version 1.0</em>
</p>
`.trim();
}

/** Seed a comprehensive default T&amp;C document (P4.3). */
export async function seedDefaultTerms(practiceId: string) {
  const db = scopedDb(practiceId);
  const practice = await db.practice.findUnique({ where: { id: practiceId }, select: { name: true } });
  const practiceName = practice?.name ?? "your dental practice";

  await deactivateOtherActive(db, "TERMS_AND_CONDITIONS");

  return db.planDocument.create({
    data: {
      practiceId,
      type: "TERMS_AND_CONDITIONS",
      title: `${practiceName} — Terms and Conditions`,
      content: defaultTermsHtml(practiceName),
      version: "1.0",
      effectiveDate: new Date(),
      isActive: true,
    },
  });
}
