"use client";

import { useMemo, useState } from "react";
import { sponsorsData } from "@ir/mocks";
import type { Sponsor } from "@ir/types";
import { Button, DataTable, Dialog, Input, Navbar, Select } from "@ir/ui";

const emptyForm: Omit<Sponsor, "id" | "cliques"> = { nome: "", logo: "", status: "ativo" };

export default function PatrocinadoresPage(): JSX.Element {
  const [items, setItems] = useState<Sponsor[]>(sponsorsData);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const rows = useMemo(() => items.map((item) => ({ ...item })), [items]);

  const handleSave = (): void => {
    if (!form.nome.trim()) return;
    if (editingId) {
      setItems((prev) => prev.map((item) => (item.id === editingId ? { ...item, ...form } : item)));
    } else {
      setItems((prev) => [{ id: `s${Date.now()}`, cliques: 0, ...form }, ...prev]);
    }
    setOpen(false);
    setEditingId(null);
    setForm(emptyForm);
  };

  const startEdit = (id: string): void => {
    const item = items.find((entry) => entry.id === id);
    if (!item) return;
    setEditingId(id);
    setForm({ nome: item.nome, logo: item.logo, status: item.status });
    setOpen(true);
  };

  return (
    <main className="min-h-screen">
      <Navbar title="Sistema Regional" links={[{ href: "/sistema", label: "Painel" }, { href: "/sistema/anuncios", label: "Anuncios" }, { href: "http://localhost:3000", label: "Site" }]} />
      <section className="mx-auto w-full max-w-6xl px-4 py-6">
        <div className="mb-4 flex items-center justify-between"><h1 className="text-2xl font-bold">Patrocinadores</h1><Button onClick={() => { setOpen(true); setEditingId(null); setForm(emptyForm); }}>Adicionar patrocinador</Button></div>
        <DataTable
          rows={rows}
          columns={[{ key: "nome", label: "Nome" }, { key: "logo", label: "Logo" }, { key: "cliques", label: "Cliques" }]}
          onEdit={startEdit}
          onDelete={(id) => setItems((prev) => prev.filter((item) => item.id !== id))}
          onToggleStatus={(id) => setItems((prev) => prev.map((item) => (item.id === id ? { ...item, status: item.status === "ativo" ? "inativo" : "ativo" } : item)))}
        />
      </section>
      <Dialog open={open} onClose={() => setOpen(false)} title={editingId ? "Editar patrocinador" : "Novo patrocinador"}>
        <div className="space-y-3">
          <Input value={form.nome} onChange={(event) => setForm((prev) => ({ ...prev, nome: event.target.value }))} placeholder="Nome" />
          <Input value={form.logo} onChange={(event) => setForm((prev) => ({ ...prev, logo: event.target.value }))} placeholder="URL do logo" />
          <Select value={form.status} onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value as Sponsor["status"] }))}>
            <option value="ativo">Ativo</option>
            <option value="inativo">Inativo</option>
          </Select>
          <div className="flex justify-end"><Button onClick={handleSave}>Salvar</Button></div>
        </div>
      </Dialog>
    </main>
  );
}
