// Logo de l'aplicació a la cantonada superior esquerra del mapa.
// El CSS que desplaça els controls de zoom de Leaflet per sota seu viu aquí,
// perquè la mida del logo i el seu espai reservat quedin al mateix lloc.
export function MapLogo() {
  return (
    <>
      <style>{`
        /* Els controls de zoom natius (top-left) van sota el logo:
           8px de marge + 44px de logo + 10px de separació. */
        .leaflet-top.leaflet-left .leaflet-control-zoom {
          margin-top: 62px;
        }
        /* A escriptori el logo és més gran (tb:h-16 = 64px), així que el zoom baixa més. */
        @media (min-width: 56rem) {
          .leaflet-top.leaflet-left .leaflet-control-zoom {
            margin-top: 82px;
          }
        }
      `}</style>
      <img
        src="/images/logo-horitzontal.png"
        alt="TerritoriADF"
        className="absolute top-2 left-2 h-11 tb:h-16 w-auto z-990 pointer-events-none select-none"
      />
    </>
  );
}
