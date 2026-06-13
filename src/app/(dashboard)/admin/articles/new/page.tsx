import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PublishForm } from "@/components/admin/PublishForm";

export const metadata = {
  title: "发布文章 - 管理后台",
};

export default function NewArticlePage() {
  return (
    <div className="container py-8">
      <div className="mb-6">
        <Link
          href="/admin/articles"
          className="inline-flex items-center rounded-lg px-3 py-2 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <ArrowLeft className="size-5" />
        </Link>
      </div>
      <PublishForm />
    </div>
  );
}
