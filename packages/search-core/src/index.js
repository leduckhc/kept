export function createInMemorySearchIndex() {
  const rows = [];
  return {
    addThread(thread) { rows.push(thread); },
    search(query) {
      const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
      return rows
        .map((thread) => {
          const haystack = `${thread.subject} ${thread.sender} ${thread.body}`.toLowerCase();
          const score = terms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0);
          return { ...thread, score, snippet: thread.body.slice(0, 140) };
        })
        .filter((row) => row.score > 0)
        .sort((a, b) => b.score - a.score);
    },
  };
}
