import { Marked } from 'marked';

function escapeHtml(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Raw HTML in the Markdown is shown as text, never as markup
const _marked = new Marked({
    gfm: true,
    breaks: true,
    renderer: {
        html(token) { return escapeHtml(token.text); }
    }
});

const SAFE_URL = /^(https?:|mailto:)/i;


/** Markdown of a TILDA note or comment as safe HTML: no raw HTML, only http(s)/mailto links, no images */
export function tildaNoteMarkdown(markdown: string): string {
    const template = document.createElement('template');
    template.innerHTML = _marked.parse(markdown, { async: false });

    template.content.querySelectorAll('a').forEach(link => {
        const href = link.getAttribute('href') || '';
        if (!SAFE_URL.test(href)) {
            link.replaceWith(...Array.from(link.childNodes));
            return;
        }
        link.setAttribute('target', '_blank');
        link.setAttribute('rel', 'noopener nofollow');
    });
    // images would load from any server; show them as a link instead
    template.content.querySelectorAll('img').forEach(img => {
        const src = img.getAttribute('src') || '';
        if (!SAFE_URL.test(src)) { img.remove(); return; }
        const link = document.createElement('a');
        link.setAttribute('href', src);
        link.setAttribute('target', '_blank');
        link.setAttribute('rel', 'noopener nofollow');
        link.textContent = img.getAttribute('alt') || src;
        img.replaceWith(link);
    });

    return template.innerHTML;
}
