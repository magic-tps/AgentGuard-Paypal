import { ShoppingAgent } from "@/components/shopping-agent";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ mandate?: string }>;
}) {
  const { mandate } = await searchParams;
  return <ShoppingAgent initialMandate={mandate} />;
}
