"use client";

import { useMemo, useState } from "react";
import { adsData } from "@ir/mocks";
import type { AdItem } from "@ir/types";
import { Button, DataTable, Dialog, Input, Navbar, Select } from "@ir/ui";

const emptyForm: Omit<AdItem, "id" | "cliques"> = {
  titulo: "",
  marca: "",
  formato: "card",
  status: "ativo",
  inicio: "",
  fim: ""
};

export default function AnunciosPage(): JSX.Element {
  const [items, setItems] = useState<AdItem[]>(adsData);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const rows = useMemo(() => items.map((item) => ({ ...item })), [items]);

  const handleSave = (): void => {
    if (!form.titulo.trim() || !form.marca.trim()) return;
    if (editingId) {
      setItems((prev) => prev.map((item) => (item.id === editingId ? { ...item, ...form } : item)));
    } else {
      setItems((prev) => [{ id: `a${Date.now()}`, cliques: 0, ...form }, ...prev]);
    }
    setOpen(false);
    setEditingId(null);
    setForm(emptyForm);
  };

  const startEdit = (id: string): void => {
    const item = items.find((entry) => entry.id === id);
    if (!item) return;
    setEditingId(id);
    setForm({ titulo: item.titulo, marca: item.marca, formato: item.formato, status: item.status, inicio: item.inicio, fim: item.fim });
    setOpen(true);
  };

  return (
    <main className="min-h-screen">
      <Navbar title="Sistema Regional" links={[{ href: "/sistema", label: "Painel" }, { href: "/sistema/patrocinadores", label: "Patrocinadores" }, { href: "http://localhost:3000", label: "Site" }]} />
      <section className="mx-auto w-full max-w-6xl px-4 py-6">
        <div className="mb-4 flex items-center justify-between"><h1 className="text-2xl font-bold">Anuncios</h1><Button onClick={() => { setOpen(true); setEditingId(null); setForm(emptyForm); }}>Adicionar anuncio</Button></div>
        <DataTable
          rows={rows}
          columns={[{ key: "titulo", label: "Titulo" }, { key: "marca", label: "Marca" }, { key: "formato", label: "Formato" }, { key: "inicio", label: "Inicio" }, { key: "fim", label: "Fim" }, { key: "cliques", label: "Cliques" }]}
          onEdit={startEdit}
          onDelete={(id) => setItems((prev) => prev.filter((item) => item.id !== id))}
          onToggleStatus={(id) => setItems((prev) => prev.map((item) => (item.id === id ? { ...item, status: item.status === "ativo" ? "inativo" : "ativo" } : item)))}
        />
      </section>
      <Dialog open={open} onClose={() => setOpen(false)} title={editingId ? "Editar anuncio" : "Novo anuncio"}>
        <div className="space-y-3">
          <Input value={form.titulo} onChange={(event) => setForm((prev) => ({ ...prev, titulo: event.target.value }))} placeholder="Titulo" />
          <Input value={form.marca} onChange={(event) => setForm((prev) => ({ ...prev, marca: event.target.value }))} placeholder="Marca" />
          <Select value={form.formato} onChange={(event) => setForm((prev) => ({ ...prev, formato: event.target.value as AdItem["formato"] }))}>
            <option value="card">Card</option>
            <option value="destaque">Destaque</option>
            <option value="lista">Lista</option>
          </Select>
          <Select value={form.status} onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value as AdItem["status"] }))}>
            <option value="ativo">Ativo</option>
            <option value="inativo">Inativo</option>
          </Select>
          <div className="grid grid-cols-2 gap-2">
            <Input type="date" value={form.inicio} onChange={(event) => setForm((prev) => ({ ...prev, inicio: event.target.value }))} />
            <Input type="date" value={form.fim} onChange={(event) => setForm((prev) => ({ ...prev, fim: event.target.value }))} />
          </div>
          <div className="flex justify-end"><Button onClick={handleSave}>Salvar</Button></div>
        </div>
      </Dialog>
    </main>
  );
}
