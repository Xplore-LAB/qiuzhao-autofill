/* Read job metadata on explicit request. No form values or background crawling. */
(() => {
  const text = (value, max = 300) => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
  function plain(value) {
    if (typeof value !== 'string') return '';
    const doc = new DOMParser().parseFromString(value.slice(0, 60000), 'text/html');
    doc.querySelectorAll('script,style,template').forEach(el => el.remove());
    return text(doc.body.textContent, 12000);
  }
  function readJob() {
    const jobs = [];
    function visit(value, depth = 0) {
      if (!value || depth > 5 || jobs.length > 20) return;
      if (Array.isArray(value)) { value.slice(0, 50).forEach(item => visit(item, depth + 1)); return; }
      if (typeof value !== 'object') return;
      const types = Array.isArray(value['@type']) ? value['@type'] : [value['@type']];
      if (types.includes('JobPosting')) jobs.push(value);
      if (value['@graph']) visit(value['@graph'], depth + 1);
      if (value.mainEntity) visit(value.mainEntity, depth + 1);
      if (value.itemListElement) visit(value.itemListElement, depth + 1);
      if (value.item) visit(value.item, depth + 1);
    }
    for (const el of [...document.querySelectorAll('script[type="application/ld+json"]')].slice(0, 10)) {
      if (el.textContent.length > 200000) continue;
      try { visit(JSON.parse(el.textContent)); } catch { /* not valid structured data */ }
    }
    // Multiple jobs on a results page must not silently become the first listing.
    const job = jobs.length === 1 ? jobs[0] : null;
    const places = job ? (Array.isArray(job.jobLocation) ? job.jobLocation : [job.jobLocation]) : [];
    const locations = places.slice(0, 8).map(place => {
      const address = place?.address;
      return typeof address === 'string' ? text(address) : address ?
        [...new Set([address.addressRegion, address.addressLocality].map(v => text(v)).filter(Boolean))].join(' ') : '';
    }).filter(Boolean);
    const heading = [...document.querySelectorAll('h1')].find(el => el.getClientRects().length);
    return {
      url: location.href,
      title: text(job?.title) || text(heading?.textContent) || text(document.title),
      company: text(job?.hiringOrganization?.name), location: locations.join(' / '),
      deadline: /^\d{4}-\d{2}-\d{2}/.test(job?.validThrough || '') ? job.validThrough.slice(0, 10) : '',
      description: job ? plain(job.description) : '',
      source: job ? 'jsonld' : 'page',
      note: jobs.length > 1 ? '当前页面含多个岗位，请打开具体岗位详情后收藏。' : job ? '已读取岗位信息，请核对后保存。' : '仅识别到页面标题，请补充并核对岗位信息。',
      ambiguous: jobs.length > 1,
    };
  }
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (message?.type !== 'GET_JOB_CONTEXT') return;
    try { respond({ ok: true, job: readJob() }); }
    catch { respond({ ok: false, error: '岗位信息读取失败，可在投递记录中手动添加。' }); }
  });
})();
