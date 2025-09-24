import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { FLASHCARD_SOURCES, type FlashcardSource, type QuestionCategory } from './data/questions'

type Theme = 'light' | 'dark'
type CategoryFilterValue = QuestionCategory | 'all'

type PermitQuestion = {
  id: string
  prompt: string
  options: string[]
  answerIndex: number
  answer: string
  reference: string
  category: QuestionCategory
  imageUrl?: string
}

const CATEGORY_ALL: CategoryFilterValue = 'all'
const PRACTICE_TEST_SIZE = 50

const shuffleArray = <T,>(input: T[]): T[] => {
  const draft = [...input]
  for (let index = draft.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[draft[index], draft[swapIndex]] = [draft[swapIndex], draft[index]]
  }
  return draft
}

const buildOptions = (
  source: FlashcardSource,
  categoryPool: FlashcardSource[],
  globalPool: FlashcardSource[],
): { options: string[]; answerIndex: number } => {
  const desiredOptionCount = 4
  const distractorSet = new Set<string>()

  const addCandidate = (candidate?: string) => {
    if (!candidate) return
    const trimmed = candidate.trim()
    if (!trimmed.length) return
    if (trimmed.toLowerCase() === source.answer.trim().toLowerCase()) return
    distractorSet.add(trimmed)
  }

  if (source.distractors?.length) {
    shuffleArray(source.distractors).forEach((item) => {
      if (distractorSet.size < desiredOptionCount - 1) addCandidate(item)
    })
  }

  const categoryAnswers = categoryPool
    .filter((item) => item.id !== source.id)
    .map((item) => item.answer)

  const globalAnswers = globalPool
    .filter((item) => item.id !== source.id)
    .map((item) => item.answer)

  const fillFromAnswers = (pool: string[]) => {
    if (!pool.length) return
    const shuffled = shuffleArray(pool)
    for (const candidate of shuffled) {
      if (distractorSet.size >= desiredOptionCount - 1) break
      addCandidate(candidate)
    }
  }

  if (distractorSet.size < desiredOptionCount - 1) {
    fillFromAnswers(categoryAnswers)
  }

  if (distractorSet.size < desiredOptionCount - 1) {
    fillFromAnswers(globalAnswers)
  }

  const combined = [source.answer, ...Array.from(distractorSet).slice(0, desiredOptionCount - 1)]
  const options = shuffleArray(combined)
  const answerIndex = options.findIndex((option) => option === source.answer)

  return {
    options,
    answerIndex: answerIndex === -1 ? 0 : answerIndex,
  }
}

const buildDeck = (sources: FlashcardSource[], globalPool: FlashcardSource[]): PermitQuestion[] => {
  if (!sources.length) return []

  const cards = sources.map((source) => {
    const categoryPool = globalPool.filter((item) => item.category === source.category)
    const { options, answerIndex } = buildOptions(source, categoryPool, globalPool)
    return {
      id: source.id,
      prompt: source.prompt,
      options,
      answerIndex,
      answer: source.answer,
      reference: source.reference,
      category: source.category,
      imageUrl: source.imageUrl,
    }
  })

  return shuffleArray(cards)
}

const getPreferredTheme = (): Theme => {
  if (typeof window === 'undefined') return 'light'

  try {
    const stored = window.localStorage.getItem('pt-theme')
    if (stored === 'light' || stored === 'dark') {
      return stored
    }
  } catch {
    // Ignore storage access errors and fall back to system preference.
  }

  const mediaQuery = window.matchMedia?.('(prefers-color-scheme: dark)')
  if (mediaQuery && mediaQuery.matches) return 'dark'
  return 'light'
}

function App() {
  const allSources = useMemo(() => FLASHCARD_SOURCES, [])
  const [theme, setTheme] = useState<Theme>(() => getPreferredTheme())
  const [activeCategory, setActiveCategory] = useState<CategoryFilterValue>(CATEGORY_ALL)
  const [mode, setMode] = useState<'study' | 'practiceTest'>('study')

  const categoryOptions = useMemo(() => {
    const uniqueCategories = Array.from(new Set(allSources.map((item) => item.category))).sort((a, b) =>
      a.localeCompare(b),
    )

    return [
      { value: CATEGORY_ALL as CategoryFilterValue, label: 'All Topics' },
      ...uniqueCategories.map((category) => ({ value: category, label: category })),
    ]
  }, [allSources])

  const filteredSources = useMemo(() => {
    if (activeCategory === CATEGORY_ALL) return allSources
    return allSources.filter((item) => item.category === activeCategory)
  }, [activeCategory, allSources])

  const [deck, setDeck] = useState<PermitQuestion[]>(() => buildDeck(allSources, allSources))
  const [currentIndex, setCurrentIndex] = useState(0)
  const [selectedOption, setSelectedOption] = useState<number | null>(null)
  const [correctCount, setCorrectCount] = useState(0)
  const [showSummary, setShowSummary] = useState(false)

  useEffect(() => {
    const root = document.documentElement
    if (!root) return

    root.classList.remove('theme-light', 'theme-dark')
    root.classList.add(theme === 'dark' ? 'theme-dark' : 'theme-light')

    try {
      window.localStorage.setItem('pt-theme', theme)
    } catch {
      // Ignore persistence errors; theme will reset to system preference.
    }
  }, [theme])

  useEffect(() => {
    if (mode !== 'study') return
    setDeck(buildDeck(filteredSources, allSources))
    setCurrentIndex(0)
    setSelectedOption(null)
    setCorrectCount(0)
    setShowSummary(false)
  }, [filteredSources, allSources, mode])

  const currentQuestion = useMemo(() => deck[currentIndex], [deck, currentIndex])

  const progress = useMemo(() => {
    if (!deck.length) return 0
    const answered = currentIndex + (selectedOption !== null ? 1 : 0)
    return Math.round((answered / deck.length) * 100)
  }, [deck.length, currentIndex, selectedOption])

  const handleOptionClick = (optionIndex: number) => {
    if (selectedOption !== null) return
    setSelectedOption(optionIndex)
    if (mode === 'practiceTest' && optionIndex === currentQuestion.answerIndex) {
      setCorrectCount((prev) => prev + 1)
    }
  }

  const handleNext = () => {
    const hasMoreQuestions = currentIndex + 1 < deck.length
    if (hasMoreQuestions) {
      setCurrentIndex((prev) => prev + 1)
      setSelectedOption(null)
      return
    }

    if (mode === 'practiceTest') {
      setShowSummary(true)
      return
    }

    setDeck(buildDeck(filteredSources, allSources))
    setCurrentIndex(0)
    setSelectedOption(null)
  }

  const handleRestart = () => {
    if (mode === 'practiceTest') {
      startPracticeTest()
      return
    }

    setDeck(buildDeck(filteredSources, allSources))
    setCurrentIndex(0)
    setSelectedOption(null)
  }

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'))
  }

  const handleCategoryChange = (value: CategoryFilterValue) => {
    setActiveCategory(value)
  }

  const startPracticeTest = () => {
    const sampleSources = shuffleArray(allSources).slice(0, Math.min(PRACTICE_TEST_SIZE, allSources.length))
    setMode('practiceTest')
    setShowSummary(false)
    setCorrectCount(0)
    setDeck(buildDeck(sampleSources, allSources))
    setCurrentIndex(0)
    setSelectedOption(null)
  }

  const exitPracticeTest = () => {
    setMode('study')
    setShowSummary(false)
    setCorrectCount(0)
  }

  const renderCategoryFilter = () => (
    <div className="category-filter" role="group" aria-label="Filter flashcards by topic">
      {categoryOptions.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`category-chip ${option.value === activeCategory ? 'active' : ''}`}
          onClick={() => handleCategoryChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )

  if (!deck.length) {
    return (
      <div className="page">
        <header className="page__header">
          <div className="page__title-group">
            <p className="eyebrow">Utah Permit Prep</p>
            <h1>Permit Practice Flashcards</h1>
            <p className="subtitle">
              Choose a topic to begin studying. Questions and multiple-choice answers will appear once a deck is
              available.
            </p>
          </div>
          {mode === 'study' ? renderCategoryFilter() : null}
          <div className="header-actions">
            <button
              className="ghost theme-toggle"
              type="button"
              onClick={toggleTheme}
              aria-pressed={theme === 'dark'}
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              <span className="theme-toggle__icon" aria-hidden="true">
                {theme === 'dark' ? '☀️' : '🌙'}
              </span>
              <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
            </button>
          </div>
        </header>
        <main className="page__main">
          <section className="flashcard empty">Select another category to load questions.</section>
        </main>
      </div>
    )
  }

  if (mode === 'practiceTest' && showSummary) {
    const totalQuestions = deck.length || 1
    const scorePercent = Math.round((correctCount / totalQuestions) * 100)
    const passed = scorePercent >= 80

    return (
      <div className="page">
        <header className="page__header">
          <div className="page__title-group">
            <p className="eyebrow">Utah Permit Prep</p>
            <h1>Practice Test Results</h1>
            <p className="subtitle">
              You completed {totalQuestions} questions. A passing score requires at least 80%.
            </p>
          </div>
          <div className="header-actions">
            <button
              className="ghost theme-toggle"
              type="button"
              onClick={toggleTheme}
              aria-pressed={theme === 'dark'}
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              <span className="theme-toggle__icon" aria-hidden="true">
                {theme === 'dark' ? '☀️' : '🌙'}
              </span>
              <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
            </button>
            <button className="ghost" type="button" onClick={exitPracticeTest}>
              Back to Study Deck
            </button>
            <button className="primary practice-toggle" type="button" onClick={startPracticeTest}>
              Retake Practice Test
            </button>
          </div>
        </header>

        <main className="page__main">
          <section className="flashcard summary">
            <div className={`summary-badge ${passed ? 'pass' : 'fail'}`}>
              {passed ? 'Pass' : 'Needs Review'}
            </div>
            <h2 className="prompt">Score: {scorePercent}%</h2>
            <div className="summary-metrics">
              <div className="summary-metric">
                <span className="summary-metric__label">Correct</span>
                <span className="summary-metric__value">{correctCount}</span>
              </div>
              <div className="summary-metric">
                <span className="summary-metric__label">Incorrect</span>
                <span className="summary-metric__value">{totalQuestions - correctCount}</span>
              </div>
              <div className="summary-metric">
                <span className="summary-metric__label">Total</span>
                <span className="summary-metric__value">{totalQuestions}</span>
              </div>
            </div>
            <p className="summary-help">
              {passed
                ? 'Great job! You’re on track for the permit exam.'
                : 'Keep studying the flashcards and try the practice test again.'}
            </p>
          </section>
        </main>
      </div>
    )
  }

  const isCorrectSelection = selectedOption === currentQuestion.answerIndex

  const optionVariant = (optionIndex: number) => {
    if (selectedOption === null) return 'default'
    if (optionIndex === currentQuestion.answerIndex) return 'correct'
    if (optionIndex === selectedOption) return 'incorrect'
    return 'muted'
  }

  return (
    <div className="page">
      <header className="page__header">
        <div className="page__title-group">
          <p className="eyebrow">Utah Permit Prep</p>
          <h1>Permit Practice Flashcards</h1>
          <p className="subtitle">
            Master key Utah driving laws with quick-fire questions, randomized answers, and topic filters.
          </p>
        </div>
        {mode === 'study' ? renderCategoryFilter() : null}
        <div className="header-actions">
          <button
            className="ghost theme-toggle"
            type="button"
            onClick={toggleTheme}
            aria-pressed={theme === 'dark'}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            <span className="theme-toggle__icon" aria-hidden="true">
              {theme === 'dark' ? '☀️' : '🌙'}
            </span>
            <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
          </button>
          {mode === 'study' ? (
            <>
              <button className="ghost" type="button" onClick={handleRestart}>
                Shuffle Deck
              </button>
              <button className="primary practice-toggle" type="button" onClick={startPracticeTest}>
                Start Practice Test
              </button>
            </>
          ) : (
            <>
              <button className="ghost" type="button" onClick={exitPracticeTest}>
                Back to Study Deck
              </button>
              <button className="primary practice-toggle" type="button" onClick={startPracticeTest}>
                Retake Practice Test
              </button>
            </>
          )}
        </div>
      </header>

      <main className="page__main">
        <section className="flashcard">
          <div className="question-meta">
            <span className="meta-chip">Question {currentIndex + 1}</span>
            <span className="meta-chip subdued">{deck.length} total</span>
            <span className="meta-chip category">{currentQuestion.category}</span>
          </div>

          <h2 className="prompt">{currentQuestion.prompt}</h2>

          {currentQuestion.imageUrl ? (
            <figure className="sign-figure">
              <div className="sign-figure__frame">
                <img src={currentQuestion.imageUrl} alt="Road sign to identify" loading="lazy" />
              </div>
              <figcaption>Focus on the sign graphic to choose the correct title.</figcaption>
            </figure>
          ) : null}

          <div className="options-grid">
            {currentQuestion.options.map((option, index) => (
              <button
                key={`${currentQuestion.id}-option-${index}`}
                type="button"
                className={`option-button ${optionVariant(index)}`}
                onClick={() => handleOptionClick(index)}
                aria-pressed={selectedOption === index}
              >
                <span className="option-index">{String.fromCharCode(65 + index)}</span>
                <span className="option-label">{option}</span>
              </button>
            ))}
          </div>

          {selectedOption !== null ? (
            <div className={`feedback ${isCorrectSelection ? 'positive' : 'negative'}`}>
              <h3>{isCorrectSelection ? 'Correct!' : 'Not quite.'}</h3>
              <p>
                {isCorrectSelection
                  ? 'Nice work — keep the momentum going.'
                  : 'Review the correct answer below and try again next round.'}
              </p>
              <p className="explanation">
                <span className="answer-label">Correct answer:</span> {currentQuestion.answer}
              </p>
              <p className="reference">Reference: {currentQuestion.reference}</p>
            </div>
          ) : (
            <p className="helper-text">Select an answer choice to reveal the solution and citation.</p>
          )}

          <div className="controls">
            <div className="progress" aria-hidden="true">
              <div className="progress__bar" style={{ width: `${progress}%` }} />
            </div>
            <div className="controls__actions">
              {mode === 'practiceTest' ? (
                <span className="progress-text">
                  {correctCount} correct | {deck.length} questions | {progress}% complete
                </span>
              ) : (
                <span className="progress-text">{progress}% complete</span>
              )}
              <button
                className="primary"
                type="button"
                onClick={handleNext}
                disabled={selectedOption === null}
              >
                {mode === 'practiceTest'
                  ? currentIndex + 1 === deck.length
                    ? 'Finish Test'
                    : 'Next Question'
                  : currentIndex + 1 === deck.length
                    ? 'Restart Deck'
                    : 'Next Question'}
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}

export default App
