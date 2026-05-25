/**
 * MCP read-only resources (§B.9). URIs under staykit://… expose context an AI assistant
 * can pull without a tool call. Everything is owner-scoped via the McpContext.
 */
import { prisma } from "../db";
import { getKpis } from "../reports";
import { parseYmd } from "../dates";
import { propertyScopeWhere, type McpContext } from "./tools";

export interface ResourceDescriptor {
  uri: string;
  name: string;
  mimeType: string;
  description?: string;
}

export interface ResourceContents {
  uri: string;
  mimeType: string;
  text: string;
}

/** Concrete resources the client can enumerate (plus dynamic per-property entries). */
export async function listResources(ctx: McpContext): Promise<ResourceDescriptor[]> {
  const properties = await prisma.property.findMany({
    where: { ...propertyScopeWhere(ctx), active: true },
    select: { id: true, name: true },
  });
  const out: ResourceDescriptor[] = [
    {
      uri: "staykit://properties",
      name: "All properties",
      mimeType: "application/json",
      description: "List of your properties",
    },
  ];
  for (const p of properties) {
    out.push({
      uri: `staykit://properties/${p.id}`,
      name: `Property: ${p.name}`,
      mimeType: "application/json",
    });
    out.push({
      uri: `staykit://policies/cancellation/${p.id}`,
      name: `Cancellation policy: ${p.name}`,
      mimeType: "text/plain",
    });
  }
  return out;
}

/** Resource templates advertised for parameterised URIs. */
export const RESOURCE_TEMPLATES = [
  {
    uriTemplate: "staykit://bookings/{id}",
    name: "Booking detail",
    mimeType: "application/json",
  },
  {
    uriTemplate: "staykit://reports/occupancy/{from}/{to}",
    name: "Occupancy snapshot (YYYY-MM-DD)",
    mimeType: "application/json",
  },
];

function json(uri: string, data: unknown): ResourceContents {
  return { uri, mimeType: "application/json", text: JSON.stringify(data, null, 2) };
}

/** Read one resource by URI. Throws if not found / not owned. */
export async function readResource(uri: string, ctx: McpContext): Promise<ResourceContents> {
  if (uri === "staykit://properties") {
    const properties = await prisma.property.findMany({
      where: propertyScopeWhere(ctx),
      select: { id: true, name: true, city: true, state: true, gstin: true },
    });
    return json(uri, properties);
  }

  // A scoped (MANAGER/STAFF) caller can only reach properties in their scope.
  const inScope = (id: string) =>
    ctx.propertyScopes.length === 0 || ctx.propertyScopes.includes(id);

  const property = uri.match(/^staykit:\/\/properties\/([^/]+)$/);
  if (property) {
    const p = inScope(property[1])
      ? await prisma.property.findFirst({
          where: { id: property[1], ownerId: ctx.ownerId },
          include: { rooms: true, roomTypes: true },
        })
      : null;
    if (!p) throw new Error("Property not found.");
    return json(uri, p);
  }

  const policy = uri.match(/^staykit:\/\/policies\/cancellation\/([^/]+)$/);
  if (policy) {
    const p = inScope(policy[1])
      ? await prisma.property.findFirst({
          where: { id: policy[1], ownerId: ctx.ownerId },
          select: { cancellationPolicy: true, name: true },
        })
      : null;
    if (!p) throw new Error("Property not found.");
    return {
      uri,
      mimeType: "text/plain",
      text: p.cancellationPolicy ?? "No cancellation policy set for this property.",
    };
  }

  const booking = uri.match(/^staykit:\/\/bookings\/([^/]+)$/);
  if (booking) {
    const b = await prisma.booking.findFirst({
      where: { id: booking[1], property: propertyScopeWhere(ctx) },
      include: {
        guests: { include: { guest: true } },
        rooms: { include: { room: true } },
        payments: true,
        refunds: true,
      },
    });
    if (!b) throw new Error("Booking not found.");
    return json(uri, b);
  }

  const occ = uri.match(/^staykit:\/\/reports\/occupancy\/([^/]+)\/([^/]+)$/);
  if (occ) {
    // A single-property-scoped caller only sees their property's occupancy.
    const propertyId = ctx.propertyScopes.length === 1 ? ctx.propertyScopes[0] : undefined;
    const kpis = await getKpis(ctx.ownerId, parseYmd(occ[1]), parseYmd(occ[2]), propertyId);
    return json(uri, kpis);
  }

  throw new Error(`Unknown resource: ${uri}`);
}
