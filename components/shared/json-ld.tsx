import { serializeJsonLd } from "@/lib/seo";

/**
 * Structured data. The payload is JSON built from our own database values and
 * escaped by `serializeJsonLd` (`<`, `>`, `&`), so it cannot break out of the script tag.
 */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  );
}
