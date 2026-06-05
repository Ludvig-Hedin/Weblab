"use client"

import { useState } from "react"
import { Avatar, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { Users, Plus } from "lucide-react"

interface MemberCardProps {
  name: string
  role: string
  avatarUrl: string
  onAdd: () => void
}

function MemberCard({ name, role, avatarUrl, onAdd }: MemberCardProps) {
  return (
    <Card className="p-4 md:p-6">
      <div className="flex flex-col md:flex-row items-start md:items-center gap-3 relative">
        <Avatar className="h-12 w-12">
          <AvatarImage src={avatarUrl} alt={name} />
        </Avatar>
        <div className="flex-1">
          <h3 className="font-semibold">{name}</h3>
          <p className="text-sm text-muted-foreground">{role}</p>
        </div>
        <Button variant="ghost" size="icon" onClick={onAdd} className="absolute md:static right-0 top-0">
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </Card>
  )
}

interface InviteFormProps {
  onSubmit: (email: string) => void
}

function InviteForm({ onSubmit }: InviteFormProps) {
  const [email, setEmail] = useState("")

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (email) {
      onSubmit(email)
      setEmail("")
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col md:flex-row w-full gap-2">
      <Input 
        type="email" 
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className=""
        required
      />
      <Button type="submit">Send invite</Button>
    </form>
  )
}

export function EmptySection3() {
  const handleInvite = (email: string) => {
    // Handle invite logic here
    console.log("Sending invite to:", email)
  }

  const handleAddMember = (name: string) => {
    // Handle add member logic here
    console.log("Adding member:", name)
  }

  const suggestedMembers = [
    { name: "Kurt Bates", role: "Innovation Specialist", avatarUrl: "https://github.com/shadcn.png" },
    { name: "Dennis Callis", role: "Designer", avatarUrl: "https://github.com/shadcn.png" },
    { name: "Frances Swann", role: "UI/UX Designer", avatarUrl: "https://github.com/shadcn.png" },
  ]

  return (
    <section className="bg-background py-12"> {/* Add border border-border shadow-sm and rounded-lg class to make this section look like a card */}
      <div className="flex flex-col items-center max-w-xl mx-auto px-4 md:px-6">
        <div className="flex flex-col items-center space-y-6 w-full">
          <div className="flex items-center justify-center w-12 h-12 rounded-md bg-card border shadow-sm">
            <Users className="w-6 h-6 text-foreground" />
          </div>
          
          <div className="flex flex-col items-center space-y-1 text-center">
            <h2 className="text-lg md:text-xl font-semibold text-foreground">
              Add members
            </h2>
            <p className="text-sm text-muted-foreground">
              Add the first person to start creating your team.
            </p>
          </div>

          <InviteForm onSubmit={handleInvite} />
        </div>

        <div className="w-full mt-8 space-y-4">
          {suggestedMembers.map((member) => (
            <MemberCard
              key={member.name}
              {...member}
              onAdd={() => handleAddMember(member.name)}
            />
          ))}
        </div>
      </div>
    </section>
  )
}
