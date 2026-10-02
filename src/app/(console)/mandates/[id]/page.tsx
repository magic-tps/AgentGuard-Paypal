import { MandateDetail } from "@/components/mandates";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MandateDetail id={id} />;
}
