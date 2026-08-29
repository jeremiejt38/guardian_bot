'use strict';

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');

const PAGE_SIZE = 25;

/**
 * Build a paginated select menu row plus a pagination button row.
 * @param {Array<{label:string,value:string,description?:string,emoji?:string,default?:boolean}>} allOptions
 * @param {string} baseCustomId base custom ID, the current page will be appended as `${baseCustomId}:${page}`
 * @param {string} placeholder
 * @param {number} page
 * @param {Object} [extra] extra options for the select menu (minValues, maxValues)
 * @returns {{rows:ActionRowBuilder[],page:number,totalPages:number}}
 */
function buildPaginatedSelect(allOptions, baseCustomId, placeholder, page = 0, extra = {}) {
  const totalPages = Math.max(1, Math.ceil(allOptions.length / PAGE_SIZE));
  const safePage = Math.max(0, Math.min(page, totalPages - 1));
  const start = safePage * PAGE_SIZE;
  const slice = allOptions.slice(start, start + PAGE_SIZE);

  const menu = new StringSelectMenuBuilder()
    .setCustomId(`${baseCustomId}:${safePage}`)
    .setPlaceholder(placeholder)
    .setMinValues(extra.minValues ?? 1)
    .setMaxValues(extra.maxValues ?? 1);

  if (slice.length === 0) {
    menu.addOptions([{ label: 'Aucun élément', value: 'none' }]).setDisabled(true);
  } else {
    menu.addOptions(slice.map((o) => ({
      label: o.label.slice(0, 100),
      value: o.value.slice(0, 100),
      description: o.description?.slice(0, 100),
      emoji: o.emoji,
      default: o.default ?? false
    })));
  }

  const rows = [new ActionRowBuilder().addComponents(menu)];

  if (totalPages > 1) {
    const nav = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${baseCustomId}:page:${safePage - 1}`)
        .setLabel('⬅️ Précédent')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(safePage === 0),
      new ButtonBuilder()
        .setCustomId(`${baseCustomId}:page:${safePage + 1}`)
        .setLabel('Suivant ➡️')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(safePage >= totalPages - 1)
    );
    rows.push(nav);
  }

  return { rows, page: safePage, totalPages };
}

/**
 * Parse a paginated select custom id.
 * @param {string} customId
 * @returns {{base:string,page:number,isPageButton:boolean,targetPage:number|null}}
 */
function parsePaginatedCustomId(customId) {
  const parts = customId.split(':');
  const last = parts[parts.length - 1];
  const secondLast = parts[parts.length - 2];
  if (secondLast === 'page') {
    return { base: parts.slice(0, -2).join(':'), page: Number(last), isPageButton: true, targetPage: Number(last) };
  }
  return { base: parts.slice(0, -1).join(':'), page: Number(last), isPageButton: false, targetPage: null };
}

module.exports = { buildPaginatedSelect, parsePaginatedCustomId, PAGE_SIZE };
