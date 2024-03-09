import { getCollection} from 'astro:content';

export const entryToArticle = (entry: any) => ({ params: { slug: entry.slug }, props: {article: entry}});

export const worldToTitle = {
    eon: "Eon",
    kult: "Kult",
    jarn: "Järn",
    "ereb-altor": "Ereb Altor",
    "hjaltarnas-tid": "Hjältarnas Tid",
    "kopparhavets-hjaltar": "Kopparhavets Hjältar",
    neotech: "Neotech",
    noir: "Noir",
    "the-troubleshooters": "The Troubleshooters",
}

export const typeToIcon = {
    'default': 'glyphicon glyphicon-record',
    'topic': 'glyphicon glyphicon-tag',
    'blogpost': 'glyphicon glyphicon-comment',
    'material': 'glyphicon glyphicon-briefcase',
    'person': 'glyphicon glyphicon-eye-open',
    'fraction': 'glyphicon glyphicon-certificate',
    'place': 'glyphicon glyphicon-map-marker',
    'event': 'glyphicon glyphicon-exclamation-sign',
    'campaign': 'glyphicon glyphicon-flag',
    'chronicle': 'glyphicon glyphicon-bookmark',
    'character': 'glyphicon glyphicon-heart'
}

export const typeToTitle = {
    'default': 'Default',
    'topic': 'Topic',
    'blogpost': 'Blogpost',
    'material': 'Material',
    'person': 'Person',
    'fraction': 'Fraction',
    'place': 'Place',
    'event': 'Event',
    'campaign': 'Campaign',
    'chronicle': 'Chronicle',
    'character': 'Character'
}

export const latestArticlesForWorld = async (worldSlug: string, limit: number = 0) => {
    let latestNews = await getCollection('articles', ({ data}) => {
        return data.status === 'published' && data.world === worldSlug;
    });
    latestNews = latestNews.sort((a, b) => a.data.created_date < b.data.created_date ? 1 : -1)
    if (limit > 0)
        latestNews = latestNews.slice(0, limit);
    return latestNews;
};

export const latestBlogposts = async () => {
    let latestNews = await getCollection('articles', ({ data}) => {
        return data.status === 'published' && data.type === "blogpost";
    });
    latestNews = latestNews.sort((a, b) => a.data.created_date < b.data.created_date ? 1 : -1)
    return latestNews;
};
