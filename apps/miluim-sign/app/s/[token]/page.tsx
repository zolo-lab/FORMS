import { SignerClient } from "@/components/signer-client";

export default async function SignPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <SignerClient token={token} />;
}
