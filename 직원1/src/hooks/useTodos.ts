import { useEffect, useReducer } from 'react'
import type { Todo } from '../types'

const STORAGE_KEY = 'todo-list:todos'

type Action =
  | { type: 'add'; text: string }
  | { type: 'toggle'; id: string }
  | { type: 'edit'; id: string; text: string }
  | { type: 'delete'; id: string }
  | { type: 'clearCompleted' }

function loadTodos(): Todo[] {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return stored ? (JSON.parse(stored) as Todo[]) : []
  } catch {
    return []
  }
}

function reducer(state: Todo[], action: Action): Todo[] {
  switch (action.type) {
    case 'add':
      return [
        ...state,
        { id: crypto.randomUUID(), text: action.text, completed: false, createdAt: Date.now() },
      ]
    case 'toggle':
      return state.map((todo) =>
        todo.id === action.id ? { ...todo, completed: !todo.completed } : todo,
      )
    case 'edit':
      return state.map((todo) => (todo.id === action.id ? { ...todo, text: action.text } : todo))
    case 'delete':
      return state.filter((todo) => todo.id !== action.id)
    case 'clearCompleted':
      return state.filter((todo) => !todo.completed)
  }
}

export function useTodos() {
  const [todos, dispatch] = useReducer(reducer, [], loadTodos)

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(todos))
  }, [todos])

  return {
    todos,
    addTodo: (text: string) => dispatch({ type: 'add', text }),
    toggleTodo: (id: string) => dispatch({ type: 'toggle', id }),
    editTodo: (id: string, text: string) => dispatch({ type: 'edit', id, text }),
    deleteTodo: (id: string) => dispatch({ type: 'delete', id }),
    clearCompleted: () => dispatch({ type: 'clearCompleted' }),
  }
}
