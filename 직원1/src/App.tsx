import { useMemo, useState } from 'react'
import { useTodos } from './hooks/useTodos'
import { TodoForm } from './components/TodoForm'
import { TodoList } from './components/TodoList'
import { TodoFilter } from './components/TodoFilter'
import type { Filter } from './types'
import './App.css'

function App() {
  const { todos, addTodo, toggleTodo, editTodo, deleteTodo, clearCompleted } = useTodos()
  const [filter, setFilter] = useState<Filter>('all')

  const filteredTodos = useMemo(() => {
    switch (filter) {
      case 'active':
        return todos.filter((todo) => !todo.completed)
      case 'completed':
        return todos.filter((todo) => todo.completed)
      default:
        return todos
    }
  }, [todos, filter])

  const remainingCount = useMemo(() => todos.filter((todo) => !todo.completed).length, [todos])
  const hasCompleted = todos.some((todo) => todo.completed)

  return (
    <main className="todo-app">
      <h1>투두리스트</h1>
      <TodoForm onAdd={addTodo} />
      <TodoList todos={filteredTodos} onToggle={toggleTodo} onDelete={deleteTodo} onEdit={editTodo} />
      {todos.length > 0 && (
        <TodoFilter
          filter={filter}
          onFilterChange={setFilter}
          remainingCount={remainingCount}
          hasCompleted={hasCompleted}
          onClearCompleted={clearCompleted}
        />
      )}
    </main>
  )
}

export default App
