// =====================================================================
// Amoyni — API wrapper (thin layer over Supabase RPC calls)
// =====================================================================
window.AmoyniAPI = (function () {
  async function call(fnName, params) {
    const { data, error } = await window.sb.rpc(fnName, params || {});
    if (error) throw error;
    return data;
  }

  async function selectTable(table, query) {
    let q = window.sb.from(table).select(query.select || "*");
    if (query.eq) {
      for (const key in query.eq) q = q.eq(key, query.eq[key]);
    }
    if (query.order) q = q.order(query.order.column, { ascending: !!query.order.ascending });
    if (query.limit) q = q.limit(query.limit);
    const { data, error } = await q;
    if (error) throw error;
    return data;
  }

  return { call, selectTable };
})();
