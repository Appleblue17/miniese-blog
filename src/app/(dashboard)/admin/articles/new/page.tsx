import { PublishForm } from "@/components/admin/PublishForm";

export const metadata = {
  title: "发布文章 - 管理后台",
};

export default function NewArticlePage() {
  return (
    <div className="container py-8">
      <PublishForm />
    </div>
  );
}
