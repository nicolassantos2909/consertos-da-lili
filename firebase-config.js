/* =========================================================
   Consertos da Lili — firebase-config.js
   ---------------------------------------------------------
   ➜ Enquanto este objeto estiver VAZIO, o app roda em
     MODO DEMONSTRAÇÃO (dados só no aparelho, login lili / 1234).

   ➜ Para usar o Firebase de verdade, cole aqui a configuração
     do seu projeto (Console do Firebase → Configurações do
     projeto → Seus apps → App da Web → "Configuração do SDK").
     Exemplo:

     export const firebaseConfig = {
       apiKey: "AIza...",
       authDomain: "consertos-da-lili.firebaseapp.com",
       projectId: "consertos-da-lili",
       storageBucket: "consertos-da-lili.appspot.com",
       messagingSenderId: "123456789",
       appId: "1:123456789:web:abc123"
     };
   ========================================================= */

export const firebaseConfig = {
  apiKey: "AIzaSyD7g9vJDgqV0sZ3RjH-R-M8oGUeyvbOvE4",
  authDomain: "consertos-da-lili.firebaseapp.com",
  projectId: "consertos-da-lili",
  storageBucket: "consertos-da-lili.firebasestorage.app",
  messagingSenderId: "811431660950",
  appId: "1:811431660950:web:03773728f2ddc2757f21b7"
};

/* A Eliani digita só "eliani"; o app transforma em
   "eliani@consertosdalili.app" para entrar no Firebase.
   Crie o usuário no Console com esse mesmo e-mail. */
export const DOMINIO_USUARIO = 'consertosdalili.app';
