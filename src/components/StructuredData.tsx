import { getStructuredData } from "@/lib/structured-data";

export function StructuredData() {
  const schemas = getStructuredData();

  return (
    <>
      {schemas.map((schema, index) => (
        <script
          key={`${schema["@type"]}-${index}`}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
      ))}
    </>
  );
}
