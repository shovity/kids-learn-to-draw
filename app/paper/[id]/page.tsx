import PaperScreen from "@/components/PaperScreen";
import { DRAWINGS } from "@/lib/manifest";

export const dynamicParams = false;

export function generateStaticParams() {
  return DRAWINGS.map((d) => ({ id: d.id }));
}

export default async function PaperPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PaperScreen id={id} />;
}
