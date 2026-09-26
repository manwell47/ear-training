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
      name: "Graves / Retumbe de Sala",
      minHz: 0, maxHz: 100,
      boostText: "Da tamaño al ambiente, pero embarra el subgrave del bombo y el bajo que ya vienen secos por el micro directo.",
      cutText: "Muy habitual (HPF) para evitar que el retumbe de la sala ensucie el subgrave del conjunto."
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
  ],

  // Mezcla completa / máster (una pista de referencia, no un instrumento suelto)
  master: [
    {
      name: "Sub-graves / Peso",
      minHz: 0, maxHz: 60,
      boostText: "Da pegada y tamaño al conjunto, pero en un máster consume headroom al instante y castiga los altavoces pequeños.",
      cutText: "Aligera el grave sin perder el cuerpo del conjunto. Cuidado de no quedarte sin fundamento."
    },
    {
      name: "Graves / Bombo y bajo",
      minHz: 60, maxHz: 250,
      boostText: "Engorda la base rítmica, pero embarra y se come la claridad del resto en seguida.",
      cutText: "Limpia el barro típico del balance final. El truco más habitual en un máster."
    },
    {
      name: "Medios / Cuerpo de la mezcla",
      minHz: 250, maxHz: 2000,
      boostText: "Realza la presencia general, pero puede volverse nasal y fatigante enseguida.",
      cutText: "Hunde la mezcla hacia atrás, restándole energía y ataque."
    },
    {
      name: "Presencia / Inteligibilidad",
      minHz: 2000, maxHz: 6000,
      boostText: "Saca las voces y el detalle al frente (clave en el móvil), pero se vuelve agresivo al subir.",
      cutText: "Suaviza una mezcla estridente y alivia la fatiga auditiva."
    },
    {
      name: "Aire / Brillo",
      minHz: 8000, maxHz: 20000,
      boostText: "Abre la mezcla y le da ese toque caro y moderno. Subir de más delata el siseo.",
      cutText: "Oscurece el máster, dándole un carácter cálido y analógico."
    }
  ],

  // Generadores (ruido rosa / blanco): no hay instrumentos, solo balance espectral
  synthetic: [
    {
      name: "Graves",
      minHz: 0, maxHz: 250,
      boostText: "El peso relativo del ruido por abajo. Aquí no hay instrumentos: solo balance espectral.",
      cutText: "Reduce el peso del ruido por abajo, dejando un fondo más ligero y menos embarrado."
    },
    {
      name: "Medios",
      minHz: 250, maxHz: 4000,
      boostText: "Sube la zona media del ruido: se vuelve más 'presente' y agresivo de escuchar.",
      cutText: "Baja la zona media y deja el ruido más plano y menos fatigante."
    },
    {
      name: "Agudos",
      minHz: 4000, maxHz: 20000,
      boostText: "Levanta el siseo y el filo del ruido. Excelente para entrenar el oído, duro de aguantar.",
      cutText: "Redondea y oscurece el ruido quitándole el siseo de arriba."
    }
  ],

  // Orquesta sinfónica / captación de conjunto (Decca, par principal, outriggers, sala).
  orchestra: [
    {
      name: "Graves / Retumbe de la Sala",
      minHz: 0, maxHz: 120,
      boostText: "Engorda el fondo de la orquesta, pero suele traer retumbe de aire acondicionado y tráfico exterior. Rara vez se busca.",
      cutText: "Tijera muy suave para limpiar el ruido de sala y dejar sitio al grave natural de chelos y contrabajos."
    },
    {
      name: "Cuerpo / Maderas y Cuerdas Graves",
      minHz: 120, maxHz: 350,
      boostText: "Da calidez y tamaño al registro bajo (chelos, contrabajos, fagot), pero puede volverse turbio.",
      cutText: "Aclara el 'velo' opaco típico de las tomas de conjunto sin castigar la sección grave."
    },
    {
      name: "Medios / Carácter Natural",
      minHz: 350, maxHz: 2000,
      boostText: "Realza el cuerpo de maderas y metales, pero puede sonar nasal y endurecer la sección.",
      cutText: "Abre y limpia la zona media, devolviendo transparencia al conjunto."
    },
    {
      name: "Presencia / Rosin y Ataque",
      minHz: 2000, maxHz: 6000,
      boostText: "Saca el detalle de la resina del arco y el ataque de vientos. Da vida, pero se vuelve áspero al abusar.",
      cutText: "Suaviza el aguijón de metales y cuerdas en pasajes fortissimo."
    },
    {
      name: "Brillo Sedoso / Air de Sala",
      minHz: 6000, maxHz: 20000,
      boostText: "Aporta ese aire 'caro' y etéreo, casi cinematográfico, típico de una gran sala.",
      cutText: "Oscurece el conjunto restándole ese aire amplio y devolviéndolo más íntimo y vintage."
    }
  ],

  // Toms de batería (rack y suelo).
  toms: [
    {
      name: "Piel / Fundamental",
      minHz: 80, maxHz: 180,
      boostText: "Engorda el golpe y da cuerpo al tom. Aquí vive la afinación real del parche.",
      cutText: "Adelgaza el tom, dejándolo sin pegada."
    },
    {
      name: "Boom / Retumbe",
      minHz: 180, maxHz: 320,
      boostText: "Añade retumbe, pero enturbia y compite con el bombo.",
      cutText: "Domestica el retumbe y hace el tom más seco y controlado."
    },
    {
      name: "Cartón / Boxy",
      minHz: 400, maxHz: 700,
      boostText: "Suena a caja o a habitación sin tratar. Poco musical.",
      cutText: "Ahueca el tom y le da un carácter más moderno y procesado."
    },
    {
      name: "Ataque / Golpe de Baqueta",
      minHz: 2500, maxHz: 6000,
      boostText: "Saca la pegada de la baqueta contra el parche. Ayuda a que el tom corte en la mezcla.",
      cutText: "Suaviza el ataque, ideal para fills de balada o jazz."
    },
    {
      name: "Sangrado de Platos",
      minHz: 6000, maxHz: 12000,
      boostText: "Realza el sangrado metálico de los platos, volviéndolo más agresivo.",
      cutText: "Reduce el brillo y el sangrado del charles/platos sobre el micro del tom."
    }
  ],

  // Teclados eléctricos / órgano / teclas DI.
  keys: [
    {
      name: "Peso / Cuerpo",
      minHz: 80, maxHz: 200,
      boostText: "Añade calidez y peso a un teclado fino. Cuidado de no embarrar con el bajo.",
      cutText: "Limpia la zona baja para que el teclado no compita con el bajo ni el bombo."
    },
    {
      name: "Barro / Boxy",
      minHz: 250, maxHz: 600,
      boostText: "Enturbia el teclado y le da un tono encajonado.",
      cutText: "Aclara el teclado y lo hace sonar más definido y menos embarrado."
    },
    {
      name: "Honk / Nasalidad",
      minHz: 800, maxHz: 1200,
      boostText: "Suena a wah atascado o a trompa nasal. Agresivo y cansino.",
      cutText: "Domestica el tono nasal del Wurlitzer/órgano y alisa el timbre."
    },
    {
      name: "Campana / Definición",
      minHz: 2000, maxHz: 4000,
      boostText: "Saca la campana metálica del Rhodes/Wurli y el ataque de la tecla. Aquí reside el carácter.",
      cutText: "Oscurece el teclado y lo empuja hacia atrás en la mezcla."
    },
    {
      name: "Filo / Siseo",
      minHz: 5000, maxHz: 12000,
      boostText: "Realza el click de tecla y el aire, pero puede volverse estresante y fatigante.",
      cutText: "Suaviza el filo y el ruido de fondo del DI, dejando un teclado más cálido."
    }
  ],

  // Piano acústico (toma de micro cercano).
  piano: [
    {
      name: "Retumbe de Pedal",
      minHz: 80, maxHz: 150,
      boostText: "Da peso al registro grave, pero puede sonar retumbante y embarrar la mezcla.",
      cutText: "Limpia el retumbe de la caja de resonancia y define mejor el registro bajo."
    },
    {
      name: "Madera / Cuerpo",
      minHz: 150, maxHz: 400,
      boostText: "Aporta calidez y tamaño al piano. Fundamental en tomas cercanas.",
      cutText: "Deja el piano más fino y transparente, menos corpulento."
    },
    {
      name: "Boxy / Honky-Tonk",
      minHz: 400, maxHz: 1200,
      boostText: "Suena a piano barato o desafiando, tipo saloon. Poco natural.",
      cutText: "Abre el piano y elimina ese tinte nasal de caja de resonancia."
    },
    {
      name: "Ataque / Martillo",
      minHz: 2000, maxHz: 5000,
      boostText: "Saca el golpe del martillo sobre la cuerda y la definición de la melodía.",
      cutText: "Suaviza el ataque, ideal para pads o acompañamiento suave."
    },
    {
      name: "Aire / Tapa Abierta",
      minHz: 6000, maxHz: 16000,
      boostText: "Aporta ese aire brillante y abierto de una tapa de piano levantada.",
      cutText: "Oscurece el piano y lo hace sonar más íntimo y cercano."
    }
  ],

  // Maderas de orquesta (flauta, oboe, clarinete, fagot).
  woodwinds: [
    {
      name: "Ruido de Llaves / Retumbe",
      minHz: 0, maxHz: 120,
      boostText: "NUNCA. Solo amplificarás golpes de llaves, pisadas y ruido de sala.",
      cutText: "Obligatorio (HPF) para limpiar el ruido de llaves y dejar la madera limpia."
    },
    {
      name: "Cuerpo Hueco",
      minHz: 250, maxHz: 500,
      boostText: "Engorda la madera, pero puede sonar hueca y encajonada.",
      cutText: "Ahueca el exceso y aporta claridad al registro bajo de la madera."
    },
    {
      name: "Nasalidad / Woody",
      minHz: 800, maxHz: 2000,
      boostText: "Realza el carácter de tubo, pero enseguida suena gangoso y fatigante.",
      cutText: "Abre el instrumento y suaviza ese tinte de caña nasal (típico del oboe)."
    },
    {
      name: "Ataque / Lengüeta",
      minHz: 2500, maxHz: 5000,
      boostText: "Saca el 'picado' de la lengüeta y la articulación. Da presencia solista.",
      cutText: "Suaviza el ataque para pasajes suaves y ligados."
    },
    {
      name: "Aire / Soplo",
      minHz: 5000, maxHz: 14000,
      boostText: "Añade el soplo y el aire de la embocadura, esa cualidad respirada y natural.",
      cutText: "Reduce el soplo y hace la madera más pura, menos 'ruidosa'."
    }
  ],

  // Metales de orquesta (trompeta, trombón, trompa, tuba) y metales de big band.
  brass: [
    {
      name: "Retumbe / Ruido de Sala",
      minHz: 0, maxHz: 120,
      boostText: "NUNCA. Amplificarás retumbe de sala y golpes de bombeo de las válvulas.",
      cutText: "HPF habitual para limpiar los metales y ganar headroom en la mezcla."
    },
    {
      name: "Cuerpo / Peso",
      minHz: 120, maxHz: 350,
      boostText: "Engorda los metales y da sensación de potencia de sección.",
      cutText: "Adelgaza los metales grandes (tuba, trombón) para que no embarren."
    },
    {
      name: "Honk / Blat",
      minHz: 700, maxHz: 1200,
      boostText: "Saca el 'blat' agresivo de la sección, pero enseguida cansa.",
      cutText: "Domestica el blat y hace los metales más redondos y menos chillones."
    },
    {
      name: "Brillo / Bite",
      minHz: 2000, maxHz: 5000,
      boostText: "Da filo y mordiente a trompetas y trombones; los hace cortar en la mezcla.",
      cutText: "Suaviza el filo metálico y empuja la sección hacia atrás."
    },
    {
      name: "Rasp / Aspereza",
      minHz: 5000, maxHz: 14000,
      boostText: "Realza la aspereza metálica y el siseo; puede volverse muy duro.",
      cutText: "Lija la aspereza y deja un brillo metálico más noble y menos hiriente."
    }
  ],

  // Órgano rotatorio (Hammond + Leslie). Muy usado en rock, soul y góspel:
  // se ecualiza para el click de tecla y el siseo del rotor, no para graves.
  organ: [
    {
      name: "Retumbe / Ruido de Sala",
      minHz: 0, maxHz: 120,
      boostText: "NUNCA en un Leslie: amplificas el motor del rotor y el retumbe del mueble.",
      cutText: "HPF casi obligatorio; el órgano no aporta información útil por debajo."
    },
    {
      name: "Cuerpo / Growl",
      minHz: 120, maxHz: 350,
      boostText: "Engorda el registro bajo de los drawbars; cuidado con empastar el bajo de la mezcla.",
      cutText: "Aclara el órgano cuando compite con el bajo y la batería."
    },
    {
      name: "Barro y Caja",
      minHz: 250, maxHz: 800,
      boostText: "Añade barro y resonancia de mueble; emborrona la sección rítmica.",
      cutText: "El corte clásico para meter el órgano en un mix sin ensuciarlo."
    },
    {
      name: "Click / Ataque de Tecla",
      minHz: 1500, maxHz: 3500,
      boostText: "Realza el 'key click' percusivo que hace rítmico al órgano.",
      cutText: "Suaviza el click cuando el órgano debe ser un colchón suave."
    },
    {
      name: "Siseo del Rotor / Aire",
      minHz: 6000, maxHz: 20000,
      boostText: "Saca el siseo giratorio del Leslie y la chispa del registro agudo.",
      cutText: "Domestica un rotor demasiado sibilante o un amplificador ruidoso."
    }
  ],

  // Piano eléctrico (Wurlitzer / Rhodes). Clásico del soul, funk y jazz:
  // cuerpo cálido, 'bark' del Wurli y campana del tine del Rhodes.
  epiano: [
    {
      name: "Retumbe",
      minHz: 0, maxHz: 120,
      boostText: "NUNCA: solo saca ruido del pedal, de la sala y del DI.",
      cutText: "HPF estándar en el DI de un piano eléctrico."
    },
    {
      name: "Cuerpo / Calidez",
      minHz: 120, maxHz: 350,
      boostText: "Calidez y peso; hace el Rhodes más íntimo.",
      cutText: "Aligera el registro grave cuando el bajo necesita ese hueco."
    },
    {
      name: "Bark / Nasalidad",
      minHz: 700, maxHz: 1200,
      boostText: "Resalta el 'bark' agresivo del Wurlitzer; muy funky pero cansino.",
      cutText: "Suaviza la nasalidad y hace el teclado más redondo."
    },
    {
      name: "Campana / Tine (Bell)",
      minHz: 2000, maxHz: 5000,
      boostText: "Destaca la campana metálica del tine, el sonido 'bell' del Rhodes.",
      cutText: "Reduce el tintineo cuando el teclado debe fundirse con la banda."
    },
    {
      name: "Brillo / Aspereza",
      minHz: 6000, maxHz: 20000,
      boostText: "Añade chispa y aire; en exceso vuelve el DI áspero y digital.",
      cutText: "Lija la aspereza del DI y deja un brillo suave y analógico."
    }
  ],

  // Guitarra acústica. Se ecualiza para cuerpo, ataque de púa y chirrido de cuerdas.
  acoustic_guitar: [
    {
      name: "Retumbe",
      minHz: 0, maxHz: 120,
      boostText: "NUNCA: acopla el cuerpo de la guitarra y embarra la mezcla.",
      cutText: "HPF para limpiar el retumbe del mástil y del micro de cerca."
    },
    {
      name: "Cuerpo y Boom",
      minHz: 100, maxHz: 350,
      boostText: "Da cuerpo y calidez, pero el 'boom' tapa la voz y el bajo.",
      cutText: "El corte nº1 de la acústica en mezcla: elimina el boom del cuerpo."
    },
    {
      name: "Caja / Cartón",
      minHz: 300, maxHz: 900,
      boostText: "Suena a caja de cartón: nasal y barato.",
      cutText: "Quita el cartón y acerca la guitarra a un sonido natural y abierto."
    },
    {
      name: "Ataque de Púa / Cuerdas",
      minHz: 2000, maxHz: 5000,
      boostText: "Saca el ataque de la púa y la definición de las cuerdas.",
      cutText: "Suaviza el ataque cuando la acústica debe quedarse al fondo."
    },
    {
      name: "Chirrido y Aire",
      minHz: 5000, maxHz: 20000,
      boostText: "Aire y brillo de las cuerdas nuevas; realza también el chirrido del mástil.",
      cutText: "Elimina el chirrido de los dedos y el siseo del mástil."
    }
  ],

  // Percusión de mano (congas, bongos, shakers, cajón, timbales).
  percussion: [
    {
      name: "Retumbe",
      minHz: 0, maxHz: 120,
      boostText: "NUNCA: solo aporta retumbe de sala y golpes de pie.",
      cutText: "HPF para aislar la percusión del subgrave de la mezcla."
    },
    {
      name: "Cuerpo de Mano / Piel",
      minHz: 120, maxHz: 400,
      boostText: "Da cuerpo y peso al tambor; en exceso lo vuelve sordo.",
      cutText: "Define la piel y evita que la percusión embarre los graves."
    },
    {
      name: "Caja / Cartón",
      minHz: 400, maxHz: 900,
      boostText: "Suena hueco y de plástico.",
      cutText: "Abre el sonido y hace la percusión más natural y presente."
    },
    {
      name: "Slap / Ataque",
      minHz: 2000, maxHz: 6000,
      boostText: "Destaca el slap y el ataque de dedos; da ritmo y energía.",
      cutText: "Suaviza el ataque cuando la percusión debe quedar como textura."
    },
    {
      name: "Cascabeleo y Aire",
      minHz: 6000, maxHz: 20000,
      boostText: "Realza el cascabeleo de los shakers y el aire de los timbales.",
      cutText: "Domestica un cascabeleo áspero o demasiado sibilante."
    }
  ],

  // Flauta solista: soplo, hueco y un agudo fácil de volver chillón.
  flute: [
    {
      name: "Ruido de Llaves / Sala",
      minHz: 0, maxHz: 120,
      boostText: "NUNCA: solo saca el ruido de llaves, pasos y retumbe de sala.",
      cutText: "HPF para limpiar el ruido mecánico de las llaves."
    },
    {
      name: "Cuerpo / Soplo",
      minHz: 150, maxHz: 500,
      boostText: "Añade cuerpo y ese soplo respirado de la embocadura.",
      cutText: "Aligera el exceso de aire y hace la flauta más definida."
    },
    {
      name: "Hueco / Lanudo",
      minHz: 500, maxHz: 1500,
      boostText: "Suena hueco y lanudo; tapa el resto del viento-madera.",
      cutText: "Quita el hueco y hace la flauta más clara y focalizada."
    },
    {
      name: "Presencia / Ataque de Aire",
      minHz: 2500, maxHz: 6000,
      boostText: "Presencia y detalle del aire: la flauta se acerca al oyente.",
      cutText: "Aleja la flauta y la funde con la orquesta."
    },
    {
      name: "Chillido / Aire",
      minHz: 7000, maxHz: 20000,
      boostText: "Brillo y aire; puede volverse chillón y sibilante.",
      cutText: "Domestica el chillido del agudo y suaviza la flauta."
    }
  ],

  // Trompeta solista: blat, filo y aspereza del registro agudo.
  trumpet: [
    {
      name: "Retumbe",
      minHz: 0, maxHz: 150,
      boostText: "NUNCA: solo aporta golpes de válvulas y retumbe de sala.",
      cutText: "HPF para limpiar la trompeta y ganar headroom."
    },
    {
      name: "Cuerpo / Peso",
      minHz: 150, maxHz: 400,
      boostText: "Da cuerpo y sensación de potencia.",
      cutText: "Adelgaza una trompeta embolada o demasiado grande."
    },
    {
      name: "Honk / Blat",
      minHz: 800, maxHz: 1500,
      boostText: "Saca el blat agresivo; enseguida cansa y suena a juguete.",
      cutText: "El corte clásico para domeñar una trompeta chillona."
    },
    {
      name: "Filo / Brillantez",
      minHz: 2000, maxHz: 5000,
      boostText: "Da filo y mordiente para que la trompeta corte en la mezcla.",
      cutText: "Suaviza el filo metálico y empuja la trompeta hacia atrás."
    },
    {
      name: "Rasp / Aspereza",
      minHz: 5000, maxHz: 14000,
      boostText: "Realza la aspereza y el siseo; se vuelve muy duro.",
      cutText: "Lija la aspereza y deja un brillo más noble."
    }
  ]
};

/**
 * Puente de nombres -> clave canónica de ACOUSTIC_MATRIX.
 * Permite que la UI/idioma (ids de pista como "v_kick", nombres en español,
 * "mix_ref"…) resuelvan a una clase de instrumento real sin duplicar contenido.
 */
export const ACOUSTIC_CLASS_ALIASES = {
  bombo: 'kick', kick: 'kick', bomboin: 'kick',
  caja: 'snare', tarola: 'snare', snare: 'snare',
  voz: 'vocals', voces: 'vocals', vocal: 'vocals', voice: 'vocals', vox: 'vocals',
  bajo: 'bass', bass: 'bass',
  guitarra: 'guitars', guitarras: 'guitars', guitar: 'guitars', gtr: 'guitars',
  plato: 'cymbals', platos: 'cymbals', cymbal: 'cymbals', cymbals: 'cymbals',
  hihat: 'cymbals', hh: 'cymbals', crash: 'cymbals', ride: 'cymbals', overhead: 'cymbals', oh: 'cymbals',
  tom: 'toms', toms: 'toms', racktom: 'toms', floortom: 'toms', timbal: 'toms', timbales: 'toms',
  sala: 'room', room: 'room', reverb: 'room', ambience: 'room', amb: 'room',
  orquesta: 'orchestra', orchestra: 'orchestra', orch: 'orchestra', sinfonica: 'orchestra',
  sinfonico: 'orchestra', clasica: 'orchestra', clasico: 'orchestra', decca: 'orchestra',
  ensemble: 'orchestra', mainpair: 'orchestra',
  cuerda: 'strings', cuerdas: 'strings', violin: 'strings', cello: 'strings', viola: 'strings', strings: 'strings',
  woodwind: 'woodwinds', woodwinds: 'woodwinds', madera: 'woodwinds', maderas: 'woodwinds',
  oboe: 'woodwinds', clarinete: 'woodwinds', clarinet: 'woodwinds',
  fagot: 'woodwinds', bassoon: 'woodwinds', saxo: 'woodwinds', sax: 'woodwinds',
  // Dedicated solo cases (still reachable via the generic section aliases above).
  flauta: 'flute', flute: 'flute', flautin: 'flute', piccolo: 'flute',
  brass: 'brass', metal: 'brass', metales: 'brass',
  trompeta: 'trumpet', trumpet: 'trumpet', trompetista: 'trumpet',
  trombon: 'brass', trombone: 'brass', tuba: 'brass', trompa: 'brass', horn: 'brass',
  piano: 'piano', pianoacustico: 'piano', granpiano: 'piano', steinway: 'piano',
  // Acoustic guitar case.
  acousticguitar: 'acoustic_guitar', guitarraacustica: 'acoustic_guitar', acustica: 'acoustic_guitar',
  guitarracriolla: 'acoustic_guitar', nylon: 'acoustic_guitar', steelstring: 'acoustic_guitar',
  // Hand percussion case.
  percusion: 'percussion', percusiones: 'percussion', perc: 'percussion', conga: 'percussion',
  congas: 'percussion', bongo: 'percussion', bongos: 'percussion', shaker: 'percussion',
  cajon: 'percussion', djembe: 'percussion',
  // Keys: organ and electric piano now have their own idiomatic curricula.
  organ: 'organ', organo: 'organ', leslie: 'organ', hammond: 'organ', drawbar: 'organ',
  epiano: 'epiano', wurli: 'epiano', wurlitzer: 'epiano', rhodes: 'epiano',
  pianoelectrico: 'epiano', electricpiano: 'epiano',
  keys: 'keys', key: 'keys',
  teclado: 'keys', teclas: 'keys',
  drumbus: 'drumbus', bateria: 'drumbus', mezcla: 'drumbus', mix: 'drumbus', master: 'master',
  ruido: 'synthetic', noise: 'synthetic', pink: 'synthetic', white: 'synthetic', synthetic: 'synthetic',
  generic: 'generic'
};

/**
 * Resuelve cualquier descriptor (clave canónica, id de pista o nombre libre)
 * a una clave válida de ACOUSTIC_MATRIX.
 * @param {string} input
 * @param {string} [fallback='generic']
 * @returns {string}
 */
export function resolveAcousticClassKey(input, fallback = 'generic') {
  if (!input) return fallback;
  const raw = String(input).toLowerCase().trim();
  if (ACOUSTIC_MATRIX[raw]) return raw;

  const compact = raw.replace(/[^a-z0-9]/g, '');
  if (ACOUSTIC_CLASS_ALIASES[compact]) return ACOUSTIC_CLASS_ALIASES[compact];

  // Alias más largos primero para que 'cymbals' gane a los atajos 'hh' / 'oh'.
  const aliases = Object.keys(ACOUSTIC_CLASS_ALIASES).sort((a, b) => b.length - a.length);
  for (const alias of aliases) {
    if (compact.includes(alias)) return ACOUSTIC_CLASS_ALIASES[alias];
  }
  return fallback;
}
