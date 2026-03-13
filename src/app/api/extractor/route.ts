import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60; // Timeout de 60 segundos

const API_URL = "https://api.messefrankfurt.com/service/esb_api/exhibitor-service/api/2.1/public/exhibitor/search";
const API_KEY = "LXnMWcYQhipLAS7rImEzmZ3CkrU033FMha9cwVSngG4vbufTsAOCQQ==";

function getEventVariable(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    if (!host) return "HOTELGA";
    
    const parts = host.split(".");
    let key = parts[0];
    if (key === "www" && parts.length > 1) {
      key = parts[1];
    }

    // Mapa interno de las variables exactas que usa la API para cada feria en Argentina
    const mappings: Record<string, string> = {
      "intersec-buenos-aires": "INTERSECBUENOSAIRES",
      "industriatextilexpo": "EMITEXSIMATEXCONFEMAQ",
      "biel-light-building": "BIELLIGHTBUILDINGBUENOSAIRES",
      "tecnofidta": "TECNOFIDTA",
      "arminera": "ARMINERA",
      "expoferretera": "EXPOFERRETERA",
      "hotelga": "HOTELGA",
      "emitex": "EMITEX",
      "simatex": "SIMATEX",
      "confemaq": "CONFEMAQ",
      "automechanika": "AUTOMECHANIKABUENOSAIRES"
    };

    if (mappings[key]) {
      return mappings[key];
    }

    if (["ar", "messefrankfurt"].includes(key)) {
      return "HOTELGA"; // Fallback default
    }
    
    // Si no está en el mapa, eliminamos guiones y pasamos a mayúscula por si coincide
    return key.replace(/-/g, "").toUpperCase();
  } catch (e) {
    return "HOTELGA";
  }
}

async function fetchPage(eventVariable: string, pageNumber: number, pageSize: number = 90) {
  const params = new URLSearchParams({
    findEventVariable: eventVariable,
    pageNumber: pageNumber.toString(),
    pageSize: pageSize.toString(),
  });

  const response = await fetch(`${API_URL}?${params.toString()}`, {
    method: 'GET',
    headers: {
      "apikey": API_KEY,
      "Accept": "application/json",
      "Origin": `https://${eventVariable.toLowerCase()}.ar.messefrankfurt.com`,
    },
    // Adding timeout via AbortController is generally good practice, 
    // but vercel API restricts max duration anyway.
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return response.json();
}

function extractEmails(data: any): any[] {
  const results = [];
  // Real API response: root.result.hits
  const hits = data?.result?.hits || [];
  
  for (const hit of hits) {
    const exhibitor = hit.exhibitor || {};
    const address = exhibitor.address || {};

    // Stand number is nested inside exhibitor.exhibition.exhibitionHall[0].stand[0].name
    let stand = "";
    try {
      const halls = exhibitor.exhibition?.exhibitionHall || [];
      if (halls.length > 0 && halls[0].stand?.length > 0) {
        stand = halls[0].stand[0].name || "";
      }
    } catch (_) {}
    
    let website = exhibitor.homepage || address.website || "";
    if (website && !website.startsWith("http://") && !website.startsWith("https://")) {
      website = "https://" + website;
    }
    
    results.push({
      expositor: exhibitor.name || "N/A",
      email: address.email || "",
      stand,
      website
    });
  }
  return results;
}

// ---- METODOS FIT EXPO (QREVENTOS) ----
async function fetchFitData() {
  const url = "https://apps.qreventos.com/mobile/findEmpresasBy?evento=617&expositores=true";
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "authorization": "bUJldXJDYnNJRVdFdVVCL3FnbmI4UGtXZ05VMWYzclVtbXdBYU1sclNFWT0=",
      "client-id": "ad2d0388-6511-4828-9ac6-8c0f8b0f6ade-INVI",
      "Accept": "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`Error en API FIT: ${response.status}`);
  }

  return response.json();
}

function extractFitEmails(data: any[]): any[] {
  const results = [];
  if (!Array.isArray(data)) return [];

  for (const item of data) {
    let website = "";
    if (item.empresaRedesSociales && Array.isArray(item.empresaRedesSociales)) {
      const webObj = item.empresaRedesSociales.find((red: any) => red.redSocial?.id === 1 && red.link);
      if (webObj) website = webObj.link;
    }

    results.push({
      expositor: item.nombreFantasia || item.razonSocial || "N/A",
      email: item.mailComercial || "",
      stand: item.stand || "",
      website: website || ""
    });
  }
  return results;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const url = body.url || "";
    const extractMode = body.extractMode || "all";
    const source = body.source || "messefrankfurt";
    
    let allRecords: any[] = [];
    let total = 0;
    let eventName = "";

    if (source === "fit") {
      const data = await fetchFitData();
      allRecords = extractFitEmails(data);
      total = allRecords.length;
      eventName = "FIT Expo Catalogo Oficial";
    } else {
      // LÓGICA ORIGINAL PARA MESSE FRANKFURT
      if (!url || !url.includes("messefrankfurt.com")) {
        return NextResponse.json(
          { success: false, error: "Por favor incluye un enlace válido de Messe Frankfurt." },
          { status: 400 }
        );
      }

      const eventVariable = getEventVariable(url);
      eventName = eventVariable;
      
      let userPage = 1;
      let userPageSize = 90;
      try {
        const parsedUrl = new URL(url);
        const pageParam = parsedUrl.searchParams.get("page");
        const pageSizeParam = parsedUrl.searchParams.get("pagesize");
        if (pageParam) userPage = parseInt(pageParam, 10);
        if (pageSizeParam) userPageSize = parseInt(pageSizeParam, 10);
      } catch (err) {}

      if (extractMode === "current") {
        const data = await fetchPage(eventVariable, userPage, userPageSize);
        allRecords = extractEmails(data);
        total = data?.result?.metaData?.hitsTotal || 0;
      } else {
      // "all" mode: Fetch everything implicitly handling pagination
      let page = 1;
      while (page <= 20) { // Safety limit of 20 pages
        const data = await fetchPage(eventVariable, page, 90);
        const records = extractEmails(data);
        allRecords.push(...records);
        
        total = data?.result?.metaData?.hitsTotal || 0;
        if (allRecords.length >= total || records.length === 0) {
          break;
        }
        page++;
      }
    }
  }

  return NextResponse.json({
      success: true,
      data: allRecords,
      total: total,
      event: eventName
    });
    
  } catch (e: any) {
    console.error("Scraping error:", e);
    return NextResponse.json(
      { success: false, error: `Oh no, algo salió mal internamente: ${e.message}` },
      { status: 500 }
    );
  }
}
