"use client";

import { useEffect, useRef, useState } from "react";
import type { CategorySlug } from "@ir/types";
import { SiteHeader } from "../../../components/site/SiteHeader";
import { loadNewsItems, saveNewsItems, slugify, type CmsNewsItem, type FeaturedZone } from "../../../components/site/newsStorage";
import { getCategoryLabel } from "../../../components/site/categories";

const categoryOptions: CategorySlug[] = ["geral", "saude", "esportes", "policia", "politica", "colunistas", "sociais", "jornal-online", "noticias"];

const initialForm = {
  title: "",
  excerpt: "",
  content: "",
  menuCategory: "geral" as CategorySlug,
  author: "",
  readMinutes: 3,
  publishMode: "agora" as "agora" | "programada",
  scheduledFor: "",
  featuredZone: "nenhum" as FeaturedZone
};

async function compressToTarget(file: File, targetKb = 40): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const el = new Image();
    el.onload = () => {
      URL.revokeObjectURL(url);
      resolve(el);
    };
    el.onerror = () => reject(new Error("Falha ao ler imagem."));
    el.src = url;
  });

  const maxW = 1200;
  const scale = img.width > maxW ? maxW / img.width : 1;
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível.");
  ctx.drawImage(img, 0, 0, w, h);

  let quality = 0.86;
  let data = canvas.toDataURL("image/jpeg", quality);
  while (data.length / 1024 > targetKb && quality > 0.35) {
    quality -= 0.07;
    data = canvas.toDataURL("image/jpeg", quality);
  }
  return data;
}

export default function MateriasPage(): JSX.Element {
  const [items, setItems] = useState<CmsNewsItem[]>([]);
  const [status, setStatus] = useState<string>("");
  const [form, setForm] = useState(initialForm);
  const [imageDataUrl, setImageDataUrl] = useState<string>("");
  const [processingImage, setProcessingImage] = useState(false);
  const contentRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    void (async () => {
      const all = await loadNewsItems();
      setItems(all);
    })();
  }, []);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    if (el.innerHTML !== form.content) {
      el.innerHTML = form.content;
    }
  }, [form.content]);

  async function persist(next: CmsNewsItem[], message: string): Promise<void> {
    setItems(next);
    await saveNewsItems(next);
    setStatus(message);
  }

  async function onImageChange(file: File | null): Promise<void> {
    if (!file) return;
    setProcessingImage(true);
    try {
      const compressed = await compressToTarget(file, 40);
      setImageDataUrl(compressed);
      setStatus("Imagem otimizada e pronta (meta ~40KB).");
    } catch {
      setStatus("Falha ao processar imagem.");
    } finally {
      setProcessingImage(false);
    }
  }

  async function addNews(): Promise<void> {
    if (!form.title.trim() || !form.content.trim()) {
      setStatus("Preencha título e conteúdo.");
      return;
    }
    if (!imageDataUrl) {
      setStatus("Carregue uma imagem local da matéria.");
      return;
    }
    if (form.publishMode === "programada" && !form.scheduledFor) {
      setStatus("Informe data/hora da publicação programada.");
      return;
    }

    const baseSlug = slugify(form.title);
    const uniqueSlug = items.some((i) => i.slug === baseSlug) ? `${baseSlug}-${Date.now()}` : baseSlug;
    const nowIso = new Date().toISOString();

    const news: CmsNewsItem = {
      id: `n-${Date.now()}`,
      slug: uniqueSlug,
      title: form.title.trim(),
      excerpt: form.excerpt.trim() || form.content.trim().slice(0, 140),
      content: form.content.trim(),
      category: form.menuCategory,
      menuCategory: form.menuCategory,
      imageUrl: imageDataUrl,
      publishedAt: form.publishMode === "agora" ? nowIso : new Date(form.scheduledFor).toISOString(),
      author: form.author.trim() || "Redação Informativo Regional",
      readMinutes: Number(form.readMinutes) || 3,
      isFeatured: form.featuredZone !== "nenhum",
      featuredZone: form.featuredZone,
      publishMode: form.publishMode,
      scheduledFor: form.publishMode === "programada" ? new Date(form.scheduledFor).toISOString() : undefined
    };

    const next = [news, ...items];
    await persist(next, "Matéria cadastrada e salva com garantia.");
    setForm(initialForm);
    setImageDataUrl("");
  }

  function focusEditor(): void {
    const el = contentRef.current;
    if (!el) return;
    el.focus();
  }

  function toggleInlineMarker(marker: string): void {
    const el = contentRef.current;
    if (!el) return;
    focusEditor();
    if (marker === "**") document.execCommand("bold");
    if (marker === "*") document.execCommand("italic");
    if (marker === "__") document.execCommand("underline");
    setForm((f) => ({ ...f, content: contentRef.current?.innerHTML ?? f.content }));
  }

  function changeSelectionFontSize(deltaPx: number): void {
    const el = contentRef.current;
    if (!el) return;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      setStatus("Selecione um trecho para alterar o tamanho.");
      return;
    }
    const range = selection.getRangeAt(0);
    const selectedText = selection.toString();
    if (!selectedText.trim()) {
      setStatus("Selecione um trecho para alterar o tamanho.");
      return;
    }
    const parent = (range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
      ? (range.commonAncestorContainer as HTMLElement)
      : (range.commonAncestorContainer.parentElement as HTMLElement | null));
    const currentSize = parent ? Number.parseInt(getComputedStyle(parent).fontSize, 10) || 16 : 16;
    const nextSize = Math.min(36, Math.max(10, currentSize + deltaPx));

    const span = document.createElement("span");
    span.style.fontSize = `${nextSize}px`;
    span.appendChild(range.extractContents());
    range.insertNode(span);
    selection.removeAllRanges();
    const newRange = document.createRange();
    newRange.selectNodeContents(span);
    selection.addRange(newRange);

    setForm((f) => ({ ...f, content: contentRef.current?.innerHTML ?? f.content }));
    setStatus(`Tamanho aplicado à seleção: ${nextSize}px.`);
  }

  return (
    <main className="min-h-screen bg-stone-100 dark:bg-zinc-950">
      <SiteHeader />
      <section className="site-shell py-7">
        <h1 className="font-editorial text-4xl">Cadastro de Matérias</h1>
        <p className="mt-2 max-w-4xl text-zinc-600 dark:text-zinc-300">
          Todas as matérias ficam salvas. Destaque é definido por zona editorial e publicação pode ser imediata ou programada.
        </p>

        <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 dark:border-blue-900/40 dark:bg-blue-950/20 dark:text-blue-200">
          <p className="font-semibold">Mapa de destaque para operador</p>
          <p>• `hero-principal`: manchete principal da home</p>
          <p>• `hero-secundario`: chamada de apoio no topo</p>
          <p>• `topo-categoria`: destaque no topo da página da categoria</p>
          <p>• `nenhum`: entra somente na listagem normal</p>
        </div>

        <div className="mt-6 rounded-xl border border-zinc-300 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-semibold">Título</label>
              <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Título" className="w-full rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold">Autor</label>
              <input value={form.author} onChange={(e) => setForm((f) => ({ ...f, author: e.target.value }))} placeholder="Autor" className="w-full rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950" />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-semibold">Resumo</label>
              <input value={form.excerpt} onChange={(e) => setForm((f) => ({ ...f, excerpt: e.target.value }))} placeholder="Resumo" className="w-full rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950" />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-semibold">Conteúdo da matéria</label>
              <p className="mb-2 text-xs text-zinc-500">Fonte base do conteúdo: <strong>12px</strong>. Os botões A-/A+ alteram apenas o trecho selecionado.</p>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => toggleInlineMarker("**")} className="rounded border border-zinc-300 px-2 py-1 text-xs font-bold dark:border-zinc-700">B</button>
                <button type="button" onClick={() => toggleInlineMarker("*")} className="rounded border border-zinc-300 px-2 py-1 text-xs italic dark:border-zinc-700">I</button>
                <button type="button" onClick={() => toggleInlineMarker("__")} className="rounded border border-zinc-300 px-2 py-1 text-xs underline dark:border-zinc-700">U</button>
                <button type="button" onClick={() => changeSelectionFontSize(-1)} className="rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700">A-</button>
                <button type="button" onClick={() => changeSelectionFontSize(1)} className="rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700">A+</button>
              </div>
              <div
                ref={contentRef}
                contentEditable
                suppressContentEditableWarning
                onInput={(e) => setForm((f) => ({ ...f, content: (e.currentTarget as HTMLDivElement).innerHTML }))}
                className="min-h-[220px] w-full rounded border border-zinc-300 px-3 py-2 text-[12px] dark:border-zinc-700 dark:bg-zinc-950"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-semibold">Categoria (aba do menu)</label>
              <select value={form.menuCategory} onChange={(e) => setForm((f) => ({ ...f, menuCategory: e.target.value as CategorySlug }))} className="w-full rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950">
                {categoryOptions.map((cat) => <option key={cat} value={cat}>{getCategoryLabel(cat)}</option>)}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-semibold">Tempo de leitura (minutos)</label>
              <input type="number" min={1} max={30} value={form.readMinutes} onChange={(e) => setForm((f) => ({ ...f, readMinutes: Number(e.target.value) }))} placeholder="Ex.: 4" className="w-full rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950" />
            </div>

            <select value={form.featuredZone} onChange={(e) => setForm((f) => ({ ...f, featuredZone: e.target.value as FeaturedZone }))} className="rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950">
              <option value="nenhum">Sem destaque</option>
              <option value="hero-principal">Destaque Hero Principal</option>
              <option value="hero-secundario">Destaque Hero Secundário</option>
              <option value="topo-categoria">Topo da Categoria</option>
            </select>

            <select value={form.publishMode} onChange={(e) => setForm((f) => ({ ...f, publishMode: e.target.value as "agora" | "programada" }))} className="rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950">
              <option value="agora">Publicar agora</option>
              <option value="programada">Programar publicação</option>
            </select>

            {form.publishMode === "programada" ? (
              <input type="datetime-local" value={form.scheduledFor} onChange={(e) => setForm((f) => ({ ...f, scheduledFor: e.target.value }))} className="rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950" />
            ) : null}

            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-semibold">Imagem local da matéria (otimizada para ~40KB)</label>
              <input type="file" accept="image/*" onChange={(e) => void onImageChange(e.target.files?.[0] ?? null)} className="block w-full rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950" />
              {processingImage ? <p className="mt-1 text-xs text-zinc-500">Processando imagem...</p> : null}
              {imageDataUrl ? <img src={imageDataUrl} alt="Prévia" className="mt-2 h-44 w-72 rounded border border-zinc-300 object-contain bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900" /> : null}
            </div>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button type="button" onClick={() => void addNews()} className="rounded bg-zinc-900 px-4 py-2 text-sm font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900">
              Salvar Matéria
            </button>
            <span className="text-sm text-emerald-700 dark:text-emerald-300">{status}</span>
          </div>
        </div>

        <div className="mt-6 rounded-xl border border-dashed border-zinc-300 bg-white p-4 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
          Listagem de matérias cadastradas ficará na área do sistema (com login), com botão <strong>+</strong> para nova matéria.
        </div>
      </section>
    </main>
  );
}
