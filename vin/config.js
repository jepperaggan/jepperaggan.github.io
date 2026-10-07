// Vinprofil: kobling til databasen. Begge verdiene er offentlige og trygge å ha her;
// dataene beskyttes av innloggingen og Row Level Security. AI-nøkkelen skal ALDRI stå her.
window.VIN_CONFIG = {
  supabaseUrl: "https://qcxxtvzarpxstlmyguqi.supabase.co",
  supabaseKey: "sb_publishable_5m5Hsz9YfHSPK1MZhsXiHA_GjlwYQrW",
  userDomain: "vin.raggan.no", // brukernavnet «mollie» blir til mollie@vin.raggan.no ved innlogging
};
