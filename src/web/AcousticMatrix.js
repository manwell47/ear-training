/**
 * @file AcousticMatrix.js
 * @description Diccionario de contexto acústico para proporcionar feedback pedagógico avanzado 
 * en función del instrumento, rango de frecuencias manipulado, y polaridad (Boost/Cut).
 */

export const ACOUSTIC_MATRIX = {
  vocals: [
    {
      name: "Rumble / Ruidos subgraves",
      minHz: 0, maxHz: 80,
      boostText: "NUNCA. Solo amplificarás golpes en el pie de micro, tráfico exterior o ruidos de baja frecuencia.",
      cutText: "Obligatorio en el 99% de los casos para limpiar el headroom general de la mezcla."
    },
    {
      name: "Cuerpo / Efecto Proximidad",
      minHz: 100, maxHz: 250,
      boostText: "Aporta calor y peso a voces muy finas. Peligroso porque enmascara rápidamente la mezcla.",
      cutText: "Soluciona el 'efecto proximidad' de los micrófonos direccionales. Vital para voces densas o masculinas muy graves."
    },
    {
      name: "Nasalidad / Boxy",
      minHz: 300, maxHz: 800,
      boostText: "Suena a que el cantante está dentro de una caja de cartón o hablando por teléfono.",
      cutText: "Abre la voz, la hace sonar más natural y menos encajonada."
    },
    {
      name: "Inteligibilidad / Presencia",
      minHz: 2000, maxHz: 5000,
      boostText: "Ayuda a que la voz corte a través de un muro de guitarras. Aquí residen las consonantes.",
      cutText: "Empuja la voz hacia atrás en el plano sonoro. Útil para coros de fondo."
    },
    {
      name: "Sibilancia",
      minHz: 5000, maxHz: 8000,
      boostText: "Letal. Dispara las 'S' y las 'T', fatigando el oído inmediatamente.",
      cutText: "Actúa como un de-esser manual. Suaviza la aspereza."
    },
    {
      name: "Aire",
      minHz: 10000, maxHz: 20000,
      boostText: "Aporta ese sonido 'caro', íntimo y respirado típico del pop moderno.",
      cutText: "Oscurece la voz, dándole un tono lo-fi o vintage (cinta analógica)."
    }
  ],
  
  guitars: [
    {
      name: "Sub-Graves",
      minHz: 0, maxHz: 100,
      boostText: "Enturbia el bajo y el bombo. Totalmente innecesario.",
      cutText: "Necesario (HPF) para dejar espacio al bajo eléctrico."
    },
    {
      name: "Cuerpo y Mud",
      minHz: 150, maxHz: 300,
      boostText: "Da grosor a un amplificador de guitarra eléctrica o calor a una acústica.",
      cutText: "Elimina el barro. Fundamental en guitarras rítmicas dobles (paneadas L/R) para limpiar el centro."
    },
    {
      name: "Ataque y Dureza",
      minHz: 2000, maxHz: 4000,
      boostText: "Añade agresividad (el roce de la púa). Hace que la guitarra salte en la mezcla.",
      cutText: "Vital si la guitarra está pisando la inteligibilidad de la voz principal."
    },
    {
      name: "Frizz / Fizz",
      minHz: 5000, maxHz: 10000,
      boostText: "Acentúa el ruido estático de los amplificadores de alta ganancia (chicharra).",
      cutText: "Domestica la distorsión, haciéndola más analógica y cálida. En acústicas, suaviza el rasgueo estridente."
    }
  ],

  bass: [
    {
      name: "Sub",
      minHz: 20, maxHz: 60,
      boostText: "Aporta peso de club. Si se exagera, se come todo el headroom del bus máster.",
      cutText: "Se usa para cederle el subgrave extremo al bombo y evitar cancelaciones de fase."
    },
    {
      name: "Cuerpo Fundamental",
      minHz: 70, maxHz: 150,
      boostText: "Define la nota real que se está tocando. Aporta solidez.",
      cutText: "Adelgaza el instrumento, dejándolo sin soporte armónico."
    },
    {
      name: "Barro / Mud",
      minHz: 200, maxHz: 300,
      boostText: "Ensucia y emborrona las notas, haciendo que los fraseos rápidos sean ininteligibles.",
      cutText: "Aporta claridad inmediata a la línea de bajo."
    },
    {
      name: "Ataque / Trasteo",
      minHz: 700, maxHz: 2500,
      boostText: "Saca a relucir el ataque del dedo o la púa y el chasquido contra los trastes. Esencial para altavoces pequeños.",
      cutText: "Genera un sonido de bajo tipo reggae, sub-heavy y redondo."
    }
  ],

  snare: [
    {
      name: "Cuerpo / Peso",
      minHz: 150, maxHz: 250,
      boostText: "Crea la 'caja gorda' (fat snare) típica del rock de los 80 o del boom-bap clásico.",
      cutText: "Deja la caja sin fuerza, sonando como un golpe sobre un papel."
    },
    {
      name: "Cartón / Boxy",
      minHz: 400, maxHz: 600,
      boostText: "Suena a instrumento barato o a habitación pequeña sin tratar.",
      cutText: "Ahueca la caja y le da un carácter más procesado e integrado."
    },
    {
      name: "Crack / Impacto",
      minHz: 2000, maxHz: 5000,
      boostText: "Acentúa el impacto literal de la baqueta contra el parche superior. Agresividad pura.",
      cutText: "Suaviza el golpe, ideal para baladas o jazz."
    },
    {
      name: "Bordón / Sizzle",
      minHz: 5000, maxHz: 10000,
      boostText: "Realza la resonancia metálica de los muelles (bordón) del parche inferior. Aporta brillo.",
      cutText: "Apaga la caja, restándole excitación."
    }
  ],

  kick: [
    {
      name: "Sub",
      minHz: 30, maxHz: 60,
      boostText: "Añade peso masivo. Puede descontrolar la mezcla si no hay buen tratamiento acústico.",
      cutText: "Adelgaza el bombo, dejándolo sin cuerpo subgrave."
    },
    {
      name: "Punch / Cuerpo",
      minHz: 70, maxHz: 120,
      boostText: "Golpe en el pecho. Da firmeza al bombo.",
      cutText: "Le quita la patada principal, dejando solo el subgrave y el click."
    },
    {
      name: "Barro / Boxy",
      minHz: 250, maxHz: 500,
      boostText: "Suena a caja de cartón o balón de baloncesto rebotando.",
      cutText: "Ahueca el bombo, consiguiendo ese sonido de rock/metal limpio y procesado."
    },
    {
      name: "Ataque / Click",
      minHz: 3000, maxHz: 8000,
      boostText: "Acentúa el impacto de la maza de plástico contra el parche. Ayuda a que el bombo se oiga en móviles.",
      cutText: "Convierte el bombo en un sonido de club oscuro, sin ataque definido."
    }
  ],

  drumbus: [
    {
      name: "Graves",
      minHz: 40, maxHz: 80,
      boostText: "Aumenta el impacto general del kit.",
      cutText: "Resta tamaño a toda la base rítmica."
    },
    {
      name: "Rango Medio",
      minHz: 250, maxHz: 500,
      boostText: "Genera un sonido apelmazado, sucio y retro.",
      cutText: "El famoso 'smiley face EQ'. Limpia la resonancia de los parches y hace sonar a la batería moderna y hi-fi."
    },
    {
      name: "Presencia",
      minHz: 3000, maxHz: 5000,
      boostText: "Trae toda la batería 'hacia adelante'. Da sensación de volumen sin subir faders. Puede volverse muy duro.",
      cutText: "Empuja la batería hacia el fondo."
    },
    {
      name: "Aire",
      minHz: 8000, maxHz: 12000,
      boostText: "Abre el campo estéreo a través de los platos y el ambiente.",
      cutText: "Oscurece la batería, haciéndola sonar vintage o apagada."
    }
  ],

  cymbals: [
    {
      name: "Basura / Sangrado",
      minHz: 0, maxHz: 300,
      boostText: "NUNCA. Añadirás ruido innecesario de otras partes de la batería.",
      cutText: "Indispensable (HPF) para quitar el sangrado de la caja y el bombo del micro del charles."
    },
    {
      name: "Metálico / Clank",
      minHz: 500, maxHz: 800,
      boostText: "Saca a relucir resonancias horribles de la aleación del plato (suena a 'tapa de olla').",
      cutText: "Suaviza el plato, haciéndolo menos invasivo y más musical."
    },
    {
      name: "Ataque",
      minHz: 3000, maxHz: 5000,
      boostText: "Acentúa la punta de la baqueta contra el metal. Suele competir peligrosamente con las voces.",
      cutText: "Empuja los platos hacia atrás en el escenario estéreo."
    },
    {
      name: "Aire / Brillo",
      minHz: 8000, maxHz: 12000,
      boostText: "Añade la efervescencia deseada ('ts-ts-ts').",
      cutText: "Oscurece el set de platos."
    }
  ],

  room: [
    {
      name: "Graves",
      minHz: 0, maxHz: 100,
      boostText: "Embarrará el subgrave sólido y mono del bombo y el bajo.",
      cutText: "Muy habitual para evitar que el ambiente embarre el subgrave del bombo y bajo."
    },
    {
      name: "Medios / Carácter",
      minHz: 1000, maxHz: 3000,
      boostText: "Si la sala suena bien, realzar esto (con compresión) genera un sonido de batería gigante e hiper-realista.",
      cutText: "Empuja la sala al fondo, dejándola solo como una reverberación sutil."
    },
    {
      name: "Agudos",
      minHz: 7000, maxHz: 20000,
      boostText: "Puede enfatizar sibilancias o rebotes caóticos de los platos.",
      cutText: "Los rebotes de la sala en altas frecuencias suelen ser desordenados. Ayuda a enfocar los overheads principales."
    }
  ],

  strings: [
    {
      name: "Madera / Cuerpo",
      minHz: 200, maxHz: 400,
      boostText: "Aporta calor y destaca el tamaño del instrumento físico (fundamental en cellos y violas).",
      cutText: "Quita peso, dejando un sonido fino tipo sintetizador barato."
    },
    {
      name: "Resonancia Nasal / Fricción",
      minHz: 1000, maxHz: 3000,
      boostText: "Puede sacar demasiado el sonido de la resina del arco contra las cuerdas, siendo áspero e incómodo.",
      cutText: "Domestica secciones de cuerdas baratas o samples mal balanceados."
    },
    {
      name: "Definición",
      minHz: 4000, maxHz: 6000,
      boostText: "Ayuda a que el pizzicato (pellizco) o los ataques rápidos destaquen en una mezcla.",
      cutText: "Suaviza el ataque, ideal para pads de cuerdas lentos."
    },
    {
      name: "Brillo Sedoso",
      minHz: 10000, maxHz: 20000,
      boostText: "Añade el 'aire de Hollywood'. Proporciona esa cualidad cara, etérea y cinematográfica.",
      cutText: "Mata el aire, haciéndolas sonar vintage o lejanas."
    }
  ],

  // Genérico para cualquier otra cosa que no esté mapeada
  generic: [
    {
      name: "Graves",
      minHz: 0, maxHz: 250,
      boostText: "Añade peso, pero vigila no emborronar la mezcla baja.",
      cutText: "Limpia frecuencias bajas, útil si choca con el bajo o el bombo."
    },
    {
      name: "Medios",
      minHz: 250, maxHz: 4000,
      boostText: "Aporta presencia, pero puede sonar nasal o duro si se exagera.",
      cutText: "Suele limpiar resonancias y empujar el sonido ligeramente hacia atrás."
    },
    {
      name: "Agudos",
      minHz: 4000, maxHz: 20000,
      boostText: "Añade brillo y aire, pero cuidado con la fatiga auditiva.",
      cutText: "Oscurece el sonido, restando excitación y cercanía."
    }
  ]
};
