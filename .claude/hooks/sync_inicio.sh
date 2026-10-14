#!/usr/bin/env bash
# Al abrir un chat: baja lo último de GitHub para que casa y trabajo arranquen igual.
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

emit() {
  printf '{"systemMessage":"%s","hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"Sincronizacion al iniciar: %s"}}\n' "$1" "$1"
}

if ! git fetch origin --quiet 2>/dev/null; then
  emit "No se pudo consultar GitHub (sin internet?). El repo local puede estar atrasado."
  exit 0
fi

behind=$(git rev-list --count HEAD..origin/master 2>/dev/null || echo 0)
ahead=$(git rev-list --count origin/master..HEAD 2>/dev/null || echo 0)

if [ -n "$(git status --porcelain)" ]; then
  emit "Hay cambios locales sin commitear; no se actualizo desde GitHub ($behind commits nuevos en GitHub). Revisar antes de trabajar."
  exit 0
fi

if [ "$behind" -gt 0 ]; then
  if git pull --ff-only --quiet origin master 2>/dev/null; then
    emit "Repo actualizado desde GitHub: $behind commit(s) nuevo(s)."
  else
    emit "GitHub tiene $behind commit(s) nuevos y hay $ahead local(es) sin subir: las ramas divergieron, hay que resolverlo a mano."
  fi
  exit 0
fi

if [ "$ahead" -gt 0 ]; then
  emit "Repo al dia con GitHub, pero hay $ahead commit(s) locales sin subir (git push)."
else
  emit "Repo al dia con GitHub."
fi
