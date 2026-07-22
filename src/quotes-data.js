/**
 * Offline "quote of the day" data. Deliberately bundled instead of fetched from a live API — see
 * src/extras.js's loadQuote() for why: no network dependency, no rate limits, always available.
 *
 * Each entry has a German and an English version of the (translated) quote plus its author, so the
 * quote itself follows the UI language like everything else. The displayed quote rotates once per
 * day, selected deterministically by day-of-year, so it's stable throughout a single day.
 */

const QUOTES = [
    { de: "Der beste Weg, die Zukunft vorherzusagen, ist, sie zu gestalten.", en: "The best way to predict the future is to create it.", author: "Peter Drucker" },
    { de: "Es ist nicht die stärkste Spezies, die überlebt, sondern die anpassungsfähigste.", en: "It is not the strongest species that survives, but the most adaptable.", author: "Charles Darwin" },
    { de: "Erfolg ist die Summe kleiner Anstrengungen, die täglich wiederholt werden.", en: "Success is the sum of small efforts repeated day in and day out.", author: "Robert Collier" },
    { de: "Was du heute kannst besorgen, das verschiebe nicht auf morgen.", en: "Never leave that till tomorrow which you can do today.", author: "Benjamin Franklin" },
    { de: "Wähle einen Job, den du liebst, und du wirst nie wieder arbeiten müssen.", en: "Choose a job you love, and you will never have to work a day in your life.", author: "Konfuzius" },
    { de: "Die Reise von tausend Meilen beginnt mit einem einzigen Schritt.", en: "A journey of a thousand miles begins with a single step.", author: "Laozi" },
    { de: "Perfektion ist nicht erreichbar, aber wenn wir nach Perfektion streben, können wir Exzellenz erreichen.", en: "Perfection is not attainable, but if we chase perfection we can catch excellence.", author: "Vince Lombardi" },
    { de: "Man kann die Wellen nicht stoppen, aber man kann lernen zu surfen.", en: "You can't stop the waves, but you can learn to surf.", author: "Jon Kabat-Zinn" },
    { de: "Es ist nie zu spät, das zu werden, was man hätte sein können.", en: "It is never too late to be what you might have been.", author: "George Eliot" },
    { de: "Konzentration ist die Wurzel aller Fähigkeiten.", en: "Concentration is the root of all the higher abilities in man.", author: "Bruce Lee" },
    { de: "Motivation bringt dich in Gang. Gewohnheit bringt dich ans Ziel.", en: "Motivation is what gets you started. Habit is what keeps you going.", author: "Jim Ryun" },
    { de: "Das Geheimnis des Erfolgs ist, anzufangen.", en: "The secret of getting ahead is getting started.", author: "Mark Twain" },
    { de: "Kleine tägliche Verbesserungen führen zu erstaunlichen Ergebnissen.", en: "Small daily improvements are the key to staggering long-term results.", author: "James Clear" },
    { de: "Zeit ist das, was wir am meisten wollen, aber am schlechtesten nutzen.", en: "Time is what we want most, but what we use worst.", author: "William Penn" },
    { de: "Konzentriere dich nicht darauf, beschäftigt zu sein, sondern darauf, produktiv zu sein.", en: "Never confuse a single defeat with a final defeat.", author: "F. Scott Fitzgerald" },
    { de: "Das Wichtigste ist, nicht aufzuhören zu fragen.", en: "The important thing is not to stop questioning.", author: "Albert Einstein" },
    { de: "Wer immer tut, was er schon kann, bleibt immer das, was er schon ist.", en: "If you always do what you've always done, you'll always get what you've always got.", author: "Henry Ford" },
    { de: "Ordnung ist die halbe Arbeit.", en: "Order is half of life.", author: "Deutsches Sprichwort" },
    { de: "Nichts ist so beständig wie der Wandel.", en: "Nothing is as constant as change.", author: "Heraklit" },
    { de: "Ein Ziel ohne Plan ist nur ein Wunsch.", en: "A goal without a plan is just a wish.", author: "Antoine de Saint-Exupéry" },
    { de: "Disziplin ist die Brücke zwischen Zielen und Erfolgen.", en: "Discipline is the bridge between goals and accomplishment.", author: "Jim Rohn" },
    { de: "Die einzige Grenze für unsere Verwirklichung von morgen sind unsere Zweifel von heute.", en: "The only limit to our realization of tomorrow will be our doubts of today.", author: "Franklin D. Roosevelt" },
    { de: "Gut gemacht ist besser als gut gesagt.", en: "Well done is better than well said.", author: "Benjamin Franklin" },
    { de: "Wissen ist Macht.", en: "Knowledge is power.", author: "Francis Bacon" },
    { de: "Man muss das Unmögliche versuchen, um das Mögliche zu erreichen.", en: "One must attempt the impossible in order to achieve the possible.", author: "Hermann Hesse" },
    { de: "Träume nicht dein Leben, sondern lebe deinen Traum.", en: "Don't dream your life, live your dream.", author: "Unbekannt" },
    { de: "Der schwierigste Schritt ist immer der erste.", en: "The first step is always the hardest.", author: "Unbekannt" },
    { de: "Was dich nicht umbringt, macht dich stärker.", en: "That which does not kill us makes us stronger.", author: "Friedrich Nietzsche" },
    { de: "Einfachheit ist die höchste Form der Raffinesse.", en: "Simplicity is the ultimate sophistication.", author: "Leonardo da Vinci" },
    { de: "Es gibt keinen Weg zum Glück. Glücklichsein ist der Weg.", en: "There is no way to happiness. Happiness is the way.", author: "Thích Nhất Hạnh" },
    { de: "Man sieht nur mit dem Herzen gut.", en: "One sees clearly only with the heart.", author: "Antoine de Saint-Exupéry" },
    { de: "Wer kämpft, kann verlieren. Wer nicht kämpft, hat schon verloren.", en: "Those who fight may lose. Those who don't fight have already lost.", author: "Bertolt Brecht" },
    { de: "Wir sind, was wir wiederholt tun. Exzellenz ist daher keine Handlung, sondern eine Gewohnheit.", en: "We are what we repeatedly do. Excellence, then, is not an act, but a habit.", author: "Will Durant (nach Aristoteles)" },
    { de: "Die beste Zeit, einen Baum zu pflanzen, war vor 20 Jahren. Die zweitbeste ist jetzt.", en: "The best time to plant a tree was 20 years ago. The second best time is now.", author: "Chinesisches Sprichwort" },
    { de: "Was du nicht willst, das man dir tu, das füg auch keinem andern zu.", en: "Do unto others as you would have them do unto you.", author: "Goldene Regel" },
    { de: "Fantasie ist wichtiger als Wissen, denn Wissen ist begrenzt.", en: "Imagination is more important than knowledge, for knowledge is limited.", author: "Albert Einstein" },
    { de: "Erfolg hat drei Buchstaben: TUN.", en: "The way to get started is to quit talking and begin doing.", author: "Walt Disney" },
    { de: "Wer aufhört, besser zu werden, hat aufgehört, gut zu sein.", en: "He who stops being better stops being good.", author: "Oliver Cromwell" },
    { de: "Man kann nicht in dieselbe Fluss zweimal steigen.", en: "No man ever steps in the same river twice.", author: "Heraklit" },
    { de: "Wer nicht wagt, der nicht gewinnt.", en: "Nothing ventured, nothing gained.", author: "Sprichwort" },
    { de: "Die Grenzen meiner Sprache bedeuten die Grenzen meiner Welt.", en: "The limits of my language mean the limits of my world.", author: "Ludwig Wittgenstein" },
    { de: "Genie ist ein Prozent Inspiration und 99 Prozent Transpiration.", en: "Genius is one percent inspiration and ninety-nine percent perspiration.", author: "Thomas Edison" },
    { de: "Der Weg ist das Ziel.", en: "The journey is the reward.", author: "Laozi" },
    { de: "Aller Anfang ist schwer.", en: "All beginnings are hard.", author: "Sprichwort" },
    { de: "Wer die Wahl hat, hat die Qual.", en: "With freedom of choice comes the agony of choice.", author: "Sprichwort" },
    { de: "Nur wer sein Ziel kennt, findet den Weg.", en: "Only those who know their destination find the way.", author: "Laozi" },
    { de: "Es kommt nicht darauf an, wie langsam du gehst, solange du nicht stehen bleibst.", en: "It does not matter how slowly you go as long as you do not stop.", author: "Konfuzius" },
    { de: "Was wir wissen, ist ein Tropfen; was wir nicht wissen, ein Ozean.", en: "What we know is a drop, what we don't know is an ocean.", author: "Isaac Newton" },
    { de: "Mach es einfach. Perfektion kommt später.", en: "Just do it. Perfection can come later.", author: "Unbekannt" },
    { de: "Ein guter Plan, heute ausgeführt, ist besser als ein perfekter Plan morgen.", en: "A good plan violently executed now is better than a perfect plan next week.", author: "George S. Patton" }
];
