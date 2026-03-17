import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { trpc } from "../lib/trpc.js";
import CharacterCard from "./CharacterCard.js";

interface CharactersTabProps {
  worldId: string;
  worldLink?: boolean;
}

export default function CharactersTab({ worldId, worldLink }: CharactersTabProps) {
  const { t } = useTranslation();
  const [showCharForm, setShowCharForm] = useState(false);
  const [charName, setCharName] = useState("");
  const [charRole, setCharRole] = useState("other");

  const charactersQuery = trpc.character.list.useQuery({ worldId });
  const createCharMut = trpc.character.create.useMutation({
    onSuccess: () => { charactersQuery.refetch(); setShowCharForm(false); setCharName(""); setCharRole("other"); },
  });
  const deleteCharMut = trpc.character.delete.useMutation({
    onSuccess: () => { charactersQuery.refetch(); },
  });

  const characters = (charactersQuery.data ?? []) as any[];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
          {t("character.count", { count: characters.length })}
          {worldLink && (
            <Link to="/world/$worldId" params={{ worldId }} className="ml-2 text-[10px] text-teal-500 hover:text-teal-600 normal-case font-normal">
              {t("character.fromWorld")}
            </Link>
          )}
        </h3>
        <button
          onClick={() => setShowCharForm(true)}
          className="text-xs px-3 py-1.5 rounded-lg bg-teal-600 text-white hover:bg-teal-500 transition-colors"
        >
          {t("character.addCharacter")}
        </button>
      </div>

      {showCharForm && (
        <div className="mb-4 p-4 rounded-xl border border-gray-200 bg-white shadow-sm">
          <h4 className="text-sm font-semibold text-gray-900 mb-3">{t("character.newCharacter")}</h4>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!charName.trim()) return;
              createCharMut.mutate({
                worldId,
                name: charName.trim(),
                role: charRole as any,
              });
            }}
            className="flex gap-3 flex-wrap"
          >
            <input
              value={charName}
              onChange={(e) => setCharName(e.target.value)}
              placeholder={t("character.namePlaceholder")}
              className="flex-1 min-w-[200px] rounded-lg bg-white border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            />
            <select
              value={charRole}
              onChange={(e) => setCharRole(e.target.value)}
              className="rounded-lg bg-white border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            >
              <option value="protagonist">{t("character.protagonist")}</option>
              <option value="antagonist">{t("character.antagonist")}</option>
              <option value="supporting">{t("character.supporting")}</option>
              <option value="minor">{t("character.minor")}</option>
              <option value="other">{t("character.other")}</option>
            </select>
            <button
              type="submit"
              disabled={createCharMut.isPending}
              className="px-4 py-2 text-sm rounded-lg bg-teal-600 text-white hover:bg-teal-500 disabled:opacity-50 transition-colors"
            >
              {createCharMut.isPending ? t("character.adding") : t("character.add")}
            </button>
            <button
              type="button"
              onClick={() => { setShowCharForm(false); setCharName(""); setCharRole("other"); }}
              className="px-3 py-2 text-sm rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
            >
              {t("character.cancel")}
            </button>
          </form>
        </div>
      )}

      {characters.length === 0 && !showCharForm ? (
        <div className="text-center py-8 text-gray-400 text-sm">
          {t("character.empty")}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {characters.map((char: any) => (
            <CharacterCard
              key={char._id}
              character={char}
              onEdit={() => {}}
              onDelete={(id) => {
                if (confirm(t("character.deleteConfirm", { name: char.name }))) {
                  deleteCharMut.mutate({ id });
                }
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
