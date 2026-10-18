import DrawScreen from "@/components/DrawScreen";
import { DRAWINGS } from "@/lib/manifest";

export const dynamicParams = false;

export function generateStaticParams() {
  return DRAWINGS.map((d) => ({ id: d.id }));
}

export default async function DrawPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DrawScreen id={id} />;
}
