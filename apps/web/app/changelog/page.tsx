import type { Metadata } from "next";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { readProjectDocument } from "@/lib/server/documentation";
export const metadata: Metadata = {
  title: "Changelog",
  description: "Versioned changes to the interface, scoring method and data.",
};
export default async function ChangelogPage() {
  const markdown = await readProjectDocument("changelog.md");
  return (
    <div className="page-shell">
      <article className="prose changelog-document">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
      </article>
    </div>
  );
}
