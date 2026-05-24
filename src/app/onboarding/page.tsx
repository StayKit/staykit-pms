import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getAppContext } from "@/lib/auth/context";
import { isConfigured } from "@/lib/payments/razorpay/client";
import { OnboardingWizard } from "@/components/owner/OnboardingWizard";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const ctx = await getAppContext();
  if (!ctx) redirect("/signin");

  const property = await prisma.property.findFirst({
    where: { ownerId: ctx.ownerId },
    orderBy: { createdAt: "asc" },
  });

  const [roomCount, ratePlanCount, templateCount] = property
    ? await Promise.all([
        prisma.room.count({ where: { propertyId: property.id } }),
        prisma.ratePlan.count({ where: { propertyId: property.id } }),
        prisma.notificationTemplate.count({ where: { ownerId: ctx.ownerId } }),
      ])
    : [0, 0, await prisma.notificationTemplate.count({ where: { ownerId: ctx.ownerId } })];

  return (
    <OnboardingWizard
      state={{
        propertyId: property?.id ?? null,
        propertyName: property?.name ?? null,
        roomCount,
        ratePlanCount,
        templateCount,
        razorpayConfigured: isConfigured(),
      }}
    />
  );
}
