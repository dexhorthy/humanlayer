package main

import (
	"context"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/charmbracelet/bubbles/key"
	"github.com/charmbracelet/bubbles/textinput"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	humanlayer "github.com/humanlayer/humanlayer-go"
)

// Request types
type RequestType string

const (
	ApprovalRequest     RequestType = "approval"
	HumanContactRequest RequestType = "human_contact"
)

// Request represents either an approval or human contact
type Request struct {
	ID         string
	CallID     string
	RunID      string
	Type       RequestType
	Message    string
	Tool       string                 // For approvals
	Parameters map[string]interface{} // For approvals
	CreatedAt  time.Time
	AgentName  string
}

// View states
type viewState int

const (
	listView viewState = iota
	detailView
	feedbackView
)

type model struct {
	client        *humanlayer.Client
	requests      []Request
	cursor        int
	viewState     viewState
	width, height int

	// For detail view
	selectedRequest *Request

	// For feedback view
	feedbackInput textinput.Model
	feedbackFor   *Request
	isApproving   bool // true for approve with comment, false for deny/human response

	// For error handling
	err error
}

type keyMap struct {
	Up      key.Binding
	Down    key.Binding
	Enter   key.Binding
	Back    key.Binding
	Approve key.Binding
	Deny    key.Binding
	Quit    key.Binding
}

var keys = keyMap{
	Up: key.NewBinding(
		key.WithKeys("up", "k"),
		key.WithHelp("↑/k", "move up"),
	),
	Down: key.NewBinding(
		key.WithKeys("down", "j"),
		key.WithHelp("↓/j", "move down"),
	),
	Enter: key.NewBinding(
		key.WithKeys("enter"),
		key.WithHelp("enter", "expand/select"),
	),
	Back: key.NewBinding(
		key.WithKeys("esc"),
		key.WithHelp("esc", "back"),
	),
	Approve: key.NewBinding(
		key.WithKeys("y"),
		key.WithHelp("y", "approve"),
	),
	Deny: key.NewBinding(
		key.WithKeys("n"),
		key.WithHelp("n", "deny/respond"),
	),
	Quit: key.NewBinding(
		key.WithKeys("q", "ctrl+c"),
		key.WithHelp("q", "quit"),
	),
}

func newModel() model {
	ti := textinput.New()
	ti.Placeholder = "Enter your response..."
	ti.CharLimit = 500
	ti.Width = 60

	// Load configuration
	config, err := LoadConfig()
	if err != nil {
		log.Fatal("Failed to load configuration:", err)
	}

	// Validate configuration
	if err := ValidateConfig(config); err != nil {
		log.Fatal("Configuration validation failed:", err)
	}

	// Create client options
	opts := []humanlayer.ClientOption{
		humanlayer.WithAPIKey(config.APIKey),
	}
	if config.APIBaseURL != "" {
		opts = append(opts, humanlayer.WithBaseURL(config.APIBaseURL))
	}

	client, err := humanlayer.NewClient(opts...)
	if err != nil {
		log.Fatal("Failed to create HumanLayer client:", err)
	}

	m := model{
		client:        client,
		requests:      []Request{},
		cursor:        0,
		viewState:     listView,
		feedbackInput: ti,
	}

	return m
}

// Tea command to fetch requests
type fetchRequestsMsg struct {
	requests []Request
	err      error
}

func fetchRequests(client *humanlayer.Client) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		var allRequests []Request

		// Fetch function calls (approvals)
		functionCalls, err := client.GetPendingFunctionCalls(ctx)
		if err != nil {
			return fetchRequestsMsg{err: err}
		}

		// Convert function calls to our Request type
		for _, fc := range functionCalls {
			// Build a message from the function name and kwargs
			message := fmt.Sprintf("Call %s", fc.Spec.Fn)
			if len(fc.Spec.Kwargs) > 0 {
				// Add first few parameters to message
				params := []string{}
				for k, v := range fc.Spec.Kwargs {
					params = append(params, fmt.Sprintf("%s=%v", k, v))
					if len(params) >= 2 {
						break
					}
				}
				message += fmt.Sprintf(" with %s", strings.Join(params, ", "))
			}

			createdAt := time.Now() // Default to now if not available
			if fc.Status != nil && fc.Status.RequestedAt != nil {
				createdAt = fc.Status.RequestedAt.Time
			}

			allRequests = append(allRequests, Request{
				ID:         fc.CallID,
				CallID:     fc.CallID,
				RunID:      fc.RunID,
				Type:       ApprovalRequest,
				Message:    message,
				Tool:       fc.Spec.Fn,
				Parameters: fc.Spec.Kwargs,
				CreatedAt:  createdAt,
				AgentName:  "Agent", // TODO: Get from somewhere
			})
		}

		// Fetch human contacts
		contacts, err := client.GetPendingHumanContacts(ctx)
		if err != nil {
			return fetchRequestsMsg{err: err}
		}

		// Convert contacts to our Request type
		for _, hc := range contacts {
			createdAt := time.Now() // Default to now if not available
			if hc.Status != nil && hc.Status.RequestedAt != nil {
				createdAt = hc.Status.RequestedAt.Time
			}

			allRequests = append(allRequests, Request{
				ID:        hc.CallID,
				CallID:    hc.CallID,
				RunID:     hc.RunID,
				Type:      HumanContactRequest,
				Message:   hc.Spec.Msg,
				CreatedAt: createdAt,
				AgentName: "Agent", // TODO: Get from somewhere
			})
		}

		return fetchRequestsMsg{requests: allRequests}
	}
}

func (m model) Init() tea.Cmd {
	return tea.Batch(
		textinput.Blink,
		fetchRequests(m.client),
	)
}

func (m model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	var cmd tea.Cmd

	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
		return m, nil

	case fetchRequestsMsg:
		if msg.err != nil {
			m.err = msg.err
			return m, nil
		}
		m.requests = msg.requests
		m.err = nil
		return m, nil

	case approvalSentMsg:
		if msg.err != nil {
			m.err = msg.err
			return m, nil
		}
		// Remove the request and refresh
		m.requests = removeRequestByID(m.requests, msg.requestID)
		if m.cursor >= len(m.requests) && m.cursor > 0 {
			m.cursor--
		}
		m.viewState = listView
		m.selectedRequest = nil
		m.feedbackFor = nil
		m.feedbackInput.Reset()
		// Refresh the list
		return m, fetchRequests(m.client)

	case humanResponseSentMsg:
		if msg.err != nil {
			m.err = msg.err
			return m, nil
		}
		// Remove the request and refresh
		m.requests = removeRequestByID(m.requests, msg.requestID)
		if m.cursor >= len(m.requests) && m.cursor > 0 {
			m.cursor--
		}
		m.viewState = listView
		m.selectedRequest = nil
		m.feedbackFor = nil
		m.feedbackInput.Reset()
		// Refresh the list
		return m, fetchRequests(m.client)

	case tea.KeyMsg:
		// Clear error on any key press
		m.err = nil

		switch m.viewState {
		case listView:
			return m.updateListView(msg)
		case detailView:
			return m.updateDetailView(msg)
		case feedbackView:
			return m.updateFeedbackView(msg)
		}
	}

	return m, cmd
}

func (m model) updateListView(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch {
	case key.Matches(msg, keys.Quit):
		return m, tea.Quit

	case key.Matches(msg, keys.Up):
		if m.cursor > 0 {
			m.cursor--
		}

	case key.Matches(msg, keys.Down):
		if m.cursor < len(m.requests)-1 {
			m.cursor++
		}

	case key.Matches(msg, keys.Enter):
		if len(m.requests) > 0 {
			m.selectedRequest = &m.requests[m.cursor]
			m.viewState = detailView
		}

	case key.Matches(msg, keys.Approve):
		if len(m.requests) > 0 {
			req := &m.requests[m.cursor]
			if req.Type == ApprovalRequest {
				// Quick approve
				return m, m.sendApproval(req.ID, true, "")
			}
		}

	case key.Matches(msg, keys.Deny):
		if len(m.requests) > 0 {
			req := &m.requests[m.cursor]
			m.feedbackFor = req
			m.isApproving = false
			m.feedbackInput.Reset()
			m.feedbackInput.Focus()
			m.viewState = feedbackView
			return m, textinput.Blink
		}
	}

	return m, nil
}

func (m model) updateDetailView(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch {
	case key.Matches(msg, keys.Back):
		m.viewState = listView
		m.selectedRequest = nil

	case key.Matches(msg, keys.Approve):
		if m.selectedRequest.Type == ApprovalRequest {
			return m, m.sendApproval(m.selectedRequest.ID, true, "")
		}

	case key.Matches(msg, keys.Deny):
		m.feedbackFor = m.selectedRequest
		m.isApproving = false
		m.feedbackInput.Reset()
		m.feedbackInput.Focus()
		m.viewState = feedbackView
		return m, textinput.Blink
	}

	return m, nil
}

func (m model) updateFeedbackView(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	var cmd tea.Cmd

	switch {
	case key.Matches(msg, keys.Back):
		m.viewState = listView
		m.feedbackFor = nil
		m.feedbackInput.Reset()
		return m, nil

	case msg.Type == tea.KeyEnter:
		// Submit feedback
		feedback := m.feedbackInput.Value()
		if feedback != "" {
			if m.feedbackFor.Type == ApprovalRequest {
				// Deny with reason
				return m, m.sendApproval(m.feedbackFor.ID, false, feedback)
			} else {
				// Human contact response
				return m, m.sendHumanResponse(m.feedbackFor.ID, feedback)
			}
		}
		return m, nil

	default:
		m.feedbackInput, cmd = m.feedbackInput.Update(msg)
		return m, cmd
	}
}

func (m model) View() string {
	switch m.viewState {
	case listView:
		return m.listViewRender()
	case detailView:
		return m.detailViewRender()
	case feedbackView:
		return m.feedbackViewRender()
	default:
		return ""
	}
}

func (m model) listViewRender() string {
	var s strings.Builder

	// Header
	header := lipgloss.NewStyle().
		Bold(true).
		Padding(0, 1).
		Render(fmt.Sprintf("Pending Requests (%d)", len(m.requests)))

	s.WriteString(header + "\n")
	s.WriteString(strings.Repeat("─", m.width) + "\n\n")

	// Show error if any
	if m.err != nil {
		errStyle := lipgloss.NewStyle().
			Foreground(lipgloss.Color("196")).
			Padding(0, 1)
		s.WriteString(errStyle.Render(fmt.Sprintf("Error: %v", m.err)) + "\n\n")
	}

	// Request list
	if len(m.requests) == 0 {
		emptyStyle := lipgloss.NewStyle().
			Foreground(lipgloss.Color("240")).
			Italic(true).
			Padding(0, 2)
		s.WriteString(emptyStyle.Render("No pending requests") + "\n")
	} else {
		for i, req := range m.requests {
			cursor := "  "
			if i == m.cursor {
				cursor = " >"
			}

			typeIcon := "📋" // approval
			if req.Type == HumanContactRequest {
				typeIcon = "💬" // human contact
			}

			line := fmt.Sprintf("%s %s %-20s %-30s %s",
				cursor,
				typeIcon,
				truncate(req.Tool, 20),
				truncate(req.Message, 30),
				formatDuration(time.Since(req.CreatedAt)),
			)

			if i == m.cursor {
				line = lipgloss.NewStyle().
					Foreground(lipgloss.Color("205")).
					Render(line)
			}

			s.WriteString(line + "\n")
		}
	}

	// Footer
	s.WriteString("\n" + strings.Repeat("─", m.width) + "\n")
	footer := lipgloss.NewStyle().
		Foreground(lipgloss.Color("240")).
		Render("[j/k] nav  [enter] expand  [y/n] quick  [q] quit")
	s.WriteString(footer)

	return s.String()
}

func (m model) detailViewRender() string {
	if m.selectedRequest == nil {
		return ""
	}

	req := m.selectedRequest
	var s strings.Builder

	// Header
	title := "Approval Request"
	if req.Type == HumanContactRequest {
		title = "Human Contact Request"
	}

	header := lipgloss.NewStyle().
		Bold(true).
		Padding(0, 1).
		Render(title + " [esc: back]")

	s.WriteString(header + "\n")
	s.WriteString(strings.Repeat("─", m.width) + "\n\n")

	// Request details
	details := lipgloss.NewStyle().
		Padding(0, 2)

	if req.Type == ApprovalRequest {
		s.WriteString(details.Render(fmt.Sprintf("Type: %s\n", req.Type)))
		s.WriteString(details.Render(fmt.Sprintf("Tool: %s\n", req.Tool)))
		s.WriteString(details.Render(fmt.Sprintf("Agent: %s\n", req.AgentName)))
		s.WriteString(details.Render(fmt.Sprintf("Time: %s ago\n", formatDuration(time.Since(req.CreatedAt)))))
		s.WriteString("\n")
		s.WriteString(details.Render("Parameters:\n"))
		for k, v := range req.Parameters {
			s.WriteString(details.Render(fmt.Sprintf("  %s: %v\n", k, v)))
		}
	} else {
		s.WriteString(details.Render(fmt.Sprintf("From: %s\n", req.AgentName)))
		s.WriteString(details.Render(fmt.Sprintf("Time: %s ago\n", formatDuration(time.Since(req.CreatedAt)))))
		s.WriteString("\n")
		s.WriteString(details.Render("Message:\n"))
		s.WriteString(details.Render(req.Message + "\n"))
	}

	// Actions
	s.WriteString("\n" + strings.Repeat("─", m.width) + "\n")

	actions := "[y] approve  [n] deny  [esc] back"
	if req.Type == HumanContactRequest {
		actions = "[n] respond  [esc] back"
	}

	footer := lipgloss.NewStyle().
		Foreground(lipgloss.Color("240")).
		Render(actions)
	s.WriteString(footer)

	return s.String()
}

func (m model) feedbackViewRender() string {
	var s strings.Builder

	title := "Deny with Feedback"
	if m.feedbackFor.Type == HumanContactRequest {
		title = "Respond to Human Contact"
	}

	header := lipgloss.NewStyle().
		Bold(true).
		Padding(0, 1).
		Render(title)

	s.WriteString(header + "\n")
	s.WriteString(strings.Repeat("─", m.width) + "\n\n")

	// Context
	context := lipgloss.NewStyle().
		Padding(0, 2).
		Foreground(lipgloss.Color("240"))

	if m.feedbackFor.Type == ApprovalRequest {
		// Build a description of what we're denying
		target := ""
		if file, ok := m.feedbackFor.Parameters["file"]; ok {
			target = fmt.Sprintf(" on %v", file)
		} else if cmd, ok := m.feedbackFor.Parameters["command"]; ok {
			target = fmt.Sprintf(": %v", cmd)
		} else if len(m.feedbackFor.Parameters) > 0 {
			// Show first parameter if we don't recognize the type
			for k, v := range m.feedbackFor.Parameters {
				target = fmt.Sprintf(" (%s: %v)", k, v)
				break
			}
		}
		s.WriteString(context.Render(fmt.Sprintf("Denying: %s%s\n\n",
			m.feedbackFor.Tool,
			target)))
	} else {
		s.WriteString(context.Render(fmt.Sprintf("Responding to: %s\n\n",
			truncate(m.feedbackFor.Message, 50))))
	}

	// Input
	s.WriteString(lipgloss.NewStyle().Padding(0, 2).Render("Response:\n"))
	s.WriteString(lipgloss.NewStyle().Padding(0, 2).Render(m.feedbackInput.View()))

	// Footer
	s.WriteString("\n\n" + strings.Repeat("─", m.width) + "\n")
	footer := lipgloss.NewStyle().
		Foreground(lipgloss.Color("240")).
		Render("[enter] send  [esc] cancel")
	s.WriteString(footer)

	return s.String()
}

// Helper functions
func removeRequest(requests []Request, index int) []Request {
	if index < 0 || index >= len(requests) {
		return requests
	}
	return append(requests[:index], requests[index+1:]...)
}

func removeRequestByID(requests []Request, id string) []Request {
	for i, req := range requests {
		if req.ID == id {
			return removeRequest(requests, i)
		}
	}
	return requests
}

func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	if max > 3 {
		return s[:max-3] + "..."
	}
	return s[:max]
}

func formatDuration(d time.Duration) string {
	if d < time.Minute {
		return fmt.Sprintf("%ds", int(d.Seconds()))
	}
	if d < time.Hour {
		return fmt.Sprintf("%dm", int(d.Minutes()))
	}
	return fmt.Sprintf("%dh", int(d.Hours()))
}

// API command messages
type approvalSentMsg struct {
	requestID string
	err       error
}

type humanResponseSentMsg struct {
	requestID string
	err       error
}

// Command to send approval/denial
func (m model) sendApproval(callID string, approved bool, comment string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		var err error
		if approved {
			err = m.client.ApproveFunctionCall(ctx, callID, comment)
		} else {
			err = m.client.DenyFunctionCall(ctx, callID, comment)
		}

		return approvalSentMsg{requestID: callID, err: err}
	}
}

// Command to send human response
func (m model) sendHumanResponse(requestID string, response string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		err := m.client.RespondToHumanContact(ctx, requestID, response)
		return humanResponseSentMsg{requestID: requestID, err: err}
	}
}
